export type MediaKind = "image" | "video";

export type MediaStep =
  | { status: "done"; url: string; costUsd: number; job?: Record<string, unknown> }
  | { status: "pending"; job: Record<string, unknown> }
  | { status: "error"; error: string };

export interface RenderInput {
  kind: MediaKind;
  prompt: string;
  seed: number;
  /** Stored reference portrait - keeps the face consistent across posts. */
  referenceImageUrl: string | null;
  /** Opaque state from a previous `pending` step (async providers). */
  job?: Record<string, unknown> | null;
  /** Used by the placeholder provider to render on-brand SVGs. */
  palette?: string[];
  scene?: string;
  label?: string;
}

/**
 * Pluggable media generation. Implementations: `placeholder` (free, deterministic SVG, DRY_RUN only)
 * and `fal` (FAL_KEY; FLUX Kontext for identity-consistent stills, Kling image-to-video for clips).
 */
export interface MediaProvider {
  readonly name: string;
  /** True when output is real media a platform can publish. */
  readonly real: boolean;
  createReference(input: { prompt: string; seed: number; palette?: string[] }): Promise<MediaStep>;
  render(input: RenderInput): Promise<MediaStep>;
  estimateCostUsd(kind: MediaKind): number;
}
