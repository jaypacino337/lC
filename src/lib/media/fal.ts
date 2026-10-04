/**
 * fal.ai adapter (queue REST API). Enabled with FAL_KEY (MEDIA_PROVIDER=fal).
 * - Reference portrait: FAL_PORTRAIT_MODEL (default fal-ai/flux/dev) from the character's look + fixed seed.
 * - Stills: FAL_IMAGE_MODEL (default fal-ai/flux-pro/kontext) edits the reference portrait into a new scene,
 *   which keeps the same face across posts. ~US$0.04/image.
 * - Clips: FAL_VIDEO_MODEL (default Kling 2.1 standard image-to-video) animates a fresh still. ~US$0.25 per 5s.
 * Jobs are asynchronous: render() returns `pending` with the queue URLs and is polled on the next cron run.
 */
import { config } from "../config";
import type { MediaKind, MediaProvider, MediaStep, RenderInput } from "./types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const COST = { portrait: 0.025, image: 0.04, video: 0.25 } as const;

interface QueueJob {
  stage: "image" | "video" | "portrait";
  statusUrl: string;
  responseUrl: string;
  imageUrl?: string;
  [k: string]: unknown;
}

export function falSubmitRequest(model: string, input: Record<string, unknown>, key: string) {
  return {
    url: `https://queue.fal.run/${model}`,
    init: { method: "POST", headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(input) },
  };
}

export function createFalProvider(f: FetchLike = fetch): MediaProvider {
  const key = () => config.falKey();
  const auth = () => ({ Authorization: `Key ${key()}` });

  async function submit(model: string, input: Record<string, unknown>, stage: QueueJob["stage"], extra: Partial<QueueJob> = {}): Promise<MediaStep> {
    const req = falSubmitRequest(model, input, key());
    const res = await f(req.url, req.init);
    if (!res.ok) return { status: "error", error: `fal submit ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const j = (await res.json()) as { status_url: string; response_url: string };
    return { status: "pending", job: { stage, statusUrl: j.status_url, responseUrl: j.response_url, ...extra } };
  }

  async function poll(job: QueueJob): Promise<{ done: false } | { done: true; output: Record<string, unknown> } | { error: string }> {
    const s = await f(job.statusUrl, { headers: auth() });
    if (!s.ok) return { error: `fal status ${s.status}` };
    const st = (await s.json()) as { status: string };
    if (st.status !== "COMPLETED") return { done: false };
    const r = await f(job.responseUrl, { headers: auth() });
    if (!r.ok) return { error: `fal result ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { done: true, output: (await r.json()) as Record<string, unknown> };
  }

  const imageUrlOf = (o: Record<string, unknown>) => ((o.images as { url: string }[] | undefined)?.[0]?.url ?? null);
  const videoUrlOf = (o: Record<string, unknown>) => ((o.video as { url: string } | undefined)?.url ?? null);

  return {
    name: "fal",
    real: true,
    estimateCostUsd: (kind: MediaKind) => (kind === "video" ? COST.image + COST.video : COST.image),
    async createReference({ prompt, seed }) {
      // Synchronous-ish: submit then poll a few times (portraits usually finish in seconds).
      const step = await submit(config.falPortraitModel(), { prompt: `Portrait, facing camera, plain background. ${prompt}`, seed, image_size: "square_hd" }, "portrait");
      if (step.status !== "pending") return step;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const p = await poll(step.job as QueueJob);
        if ("error" in p) return { status: "error", error: p.error };
        if (p.done) {
          const url = imageUrlOf(p.output);
          return url ? { status: "done", url, costUsd: COST.portrait } : { status: "error", error: "fal returned no image" };
        }
      }
      return { status: "error", error: "portrait generation timed out" };
    },
    async render(input: RenderInput): Promise<MediaStep> {
      const job = input.job as QueueJob | undefined;
      if (!job) {
        if (!input.referenceImageUrl) return { status: "error", error: "influencer has no reference image" };
        return submit(config.falImageModel(), { prompt: input.prompt, image_url: input.referenceImageUrl, seed: input.seed }, "image");
      }
      const p = await poll(job);
      if ("error" in p) return { status: "error", error: p.error };
      if (!p.done) return { status: "pending", job };
      if (job.stage === "image") {
        const url = imageUrlOf(p.output);
        if (!url) return { status: "error", error: "fal returned no image" };
        if (input.kind === "image") return { status: "done", url, costUsd: COST.image };
        return submit(config.falVideoModel(), { prompt: input.prompt, image_url: url, duration: "5", aspect_ratio: "9:16" }, "video", { imageUrl: url });
      }
      const url = videoUrlOf(p.output);
      return url ? { status: "done", url, costUsd: COST.image + COST.video, job } : { status: "error", error: "fal returned no video" };
    },
  };
}
