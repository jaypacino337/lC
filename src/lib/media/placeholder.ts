import type { MediaProvider, RenderInput } from "./types";

/** Free provider: points at our own SVG renderer. Good for DRY_RUN and local dev; not publishable to TikTok/Instagram. */
export const placeholderProvider: MediaProvider = {
  name: "placeholder",
  real: false,
  async createReference({ seed, palette }) {
    const q = new URLSearchParams({ seed: String(seed), palette: (palette ?? []).join(",") });
    return { status: "done", url: `/api/media/placeholder?${q}`, costUsd: 0 };
  },
  async render(input: RenderInput) {
    const q = new URLSearchParams({ seed: String(input.seed), palette: (input.palette ?? []).join(","), kind: input.kind });
    if (input.scene) q.set("scene", input.scene);
    if (input.label) q.set("label", input.label);
    return { status: "done", url: `/api/media/placeholder?${q}`, costUsd: 0 };
  },
  estimateCostUsd: () => 0,
};
