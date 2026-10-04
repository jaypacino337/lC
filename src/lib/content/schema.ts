import * as z from "zod";

const s = (max: number) => z.string().trim().min(1).max(max);
export const CharacterSheetSchema = z.object({
  name: s(40),
  handle: z.string().trim().max(24).regex(/^[a-z0-9._]*$/),
  tagline: s(160),
  look: s(600),
  voice: s(300),
  backstory: s(900),
  postingStyle: s(300),
  recurringLocations: z.array(s(80)).min(1).max(6),
  catchphrases: z.array(s(80)).max(4),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(3),
});
