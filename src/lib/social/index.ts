import type { Platform } from "../config";
import { instagramConnector } from "./instagram";
import { tiktokConnector } from "./tiktok";
import type { Connector } from "./types";
import { xConnector } from "./x";

export const connectors: Record<Platform, Connector> = { x: xConnector, tiktok: tiktokConnector, instagram: instagramConnector };

export function getConnector(p: string): Connector | null {
  return (connectors as Record<string, Connector>)[p] ?? null;
}

export * from "./types";
