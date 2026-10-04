import { randomUUID } from "node:crypto";
export const newId = () => randomUUID();
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "creator";
}
