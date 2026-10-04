import { config } from "../config";
import { createFalProvider } from "./fal";
import { placeholderProvider } from "./placeholder";
import type { MediaProvider } from "./types";

export function getMediaProvider(): MediaProvider {
  return config.mediaProvider() === "fal" && config.falKey() ? createFalProvider() : placeholderProvider;
}

export type { MediaProvider, MediaStep } from "./types";
