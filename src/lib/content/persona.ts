/**
 * One sentence -> character sheet.
 * Claude (when ANTHROPIC_API_KEY is set) writes the sheet and double-checks for real-person impersonation;
 * otherwise a deterministic template generator produces a usable sheet from the same sentence.
 */
import * as z from "zod";
import { claudeEnabled, generateStructured } from "../claude";
import { checkImpersonation, type GuardResult } from "../guard";
import { hashString, mulberry32, pick, pickN } from "./rand";
import type { CharacterSheet } from "./types";

export interface PersonaInput {
  sentence: string;
  tokenName: string;
  tokenSymbol: string;
}

export interface PersonaResult {
  ok: boolean;
  guard: GuardResult;
  character?: CharacterSheet;
  source?: "claude" | "template";
}

const LOOKS = [
  "soft studio lighting, slightly oversized vintage jacket, a tiny gold hoop earring",
  "sun-faded bucket hat, round tinted glasses, a chipped enamel pin on the collar",
  "glossy hair under a ring light glow, monochrome tracksuit, chunky white sneakers",
  "freckles, a knitted scarf in every season, a battered film camera on a strap",
  "neon windbreaker, reflective trims, a lanyard full of backstage passes",
  "tailored pastel suit, mismatched socks, an oversized wristwatch that is always wrong",
];
const VOICES = [
  "deadpan and dry, short sentences, lowercase, occasionally poetic",
  "warm and hyped, lots of exclamation, talks to followers like old friends",
  "chaotic narrator energy, tells everything like a nature documentary",
  "smooth late-night radio host, unhurried, a little mysterious",
  "overconfident life coach who is wrong about small things and right about big ones",
];
const LOCATIONS = [
  "a rooftop at golden hour", "a 24-hour laundromat", "a karaoke booth", "an airport gate at 6am", "a neon-lit ramen bar",
  "a boxing gym", "a desert highway rest stop", "a thrift store fitting room", "a rainy city crosswalk", "a beach boardwalk",
  "a tiny studio apartment with plants", "a festival main stage", "a late-night convenience store", "a train window seat",
];
const STYLES = [
  "photo dumps with one-line captions, the occasional 5-second face-cam clip",
  "mini vlogs: arrive, react, deliver one oddly wise line, leave",
  "street-style photos with a running joke that evolves every day",
  "POV clips and outfit checks with a recurring sign-off",
];
const PALETTES = [
  ["#ff5c39", "#ffd166", "#2b1d4e"],
  ["#00d1b2", "#c6ff3d", "#14213d"],
  ["#ff4fa3", "#ffb86b", "#251a3a"],
  ["#7c5cff", "#3df5ff", "#121a2f"],
  ["#ffcf3d", "#ff6b6b", "#1f2a24"],
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull "frog" and "loves road trips" out of "a frog who loves road trips". */
export function parseSentence(sentence: string): { subject: string; trait: string } {
  const s = sentence.trim().replace(/[.!]+$/, "");
  const m = s.match(/^(?:an?|the|my|our)?\s*(.+?)\s+(?:who|that|which|with|obsessed|addicted|living|that's|whose)\s+(.+)$/i);
  if (m) return { subject: m[1].trim(), trait: s.slice(s.indexOf(m[1]) + m[1].length).trim() };
  const words = s.replace(/^(an?|the)\s+/i, "").split(/\s+/);
  return { subject: words.slice(0, 3).join(" "), trait: words.slice(3).join(" ") || "lives for the main-character moment" };
}

export function templateCharacter(input: PersonaInput): CharacterSheet {
  const seed = hashString(`${input.sentence}|${input.tokenSymbol}`);
  const rng = mulberry32(seed);
  const { subject, trait } = parseSentence(input.sentence);
  const tickerName = input.tokenSymbol.replace(/[^a-z0-9]/gi, "");
  const name = tickerName.length >= 3 && tickerName.length <= 10 ? titleCase(tickerName.toLowerCase()) : titleCase(input.tokenName.split(" ")[0] || subject);
  const handle = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.ai`;
  const locations = pickN(rng, LOCATIONS, 4);
  return {
    name,
    handle,
    tagline: `${titleCase(subject)} ${trait}`.slice(0, 120),
    look: `A stylised, clearly fictional ${subject}: ${pick(rng, LOOKS)}. Same face, proportions and signature accessory in every post.`,
    voice: pick(rng, VOICES),
    backstory: `${name} started out as a ${subject} ${trait}. One day the internet noticed, and ${name} decided to document everything - the wins, the weird detours and the small daily rituals.`,
    postingStyle: pick(rng, STYLES),
    recurringLocations: locations,
    catchphrases: pickN(rng, ["see you on the next one", "main character hours", "stay curious", "logging off to touch grass", "tiny wins count"], 2),
    palette: pick(rng, PALETTES),
  };
}

const CharacterSchema = z.object({
  impersonatesRealPerson: z.boolean().describe("True if the persona is, or is clearly modelled on, a real identifiable person (name, nickname, likeness, catchphrase)."),
  realPersonName: z.string().describe("The real person it resembles, or empty string."),
  character: z.object({
    name: z.string(),
    handle: z.string().describe("lowercase social handle, letters/digits/dots/underscores, max 20 chars"),
    tagline: z.string(),
    look: z.string().describe("Visual description for an image model: species/form, face, hair/fur, outfit, signature accessory. Fictional."),
    voice: z.string(),
    backstory: z.string(),
    postingStyle: z.string(),
    recurringLocations: z.array(z.string()),
    catchphrases: z.array(z.string()),
    palette: z.array(z.string()).describe("three hex colours like #ff5c39"),
  }),
});

const SYSTEM = `You design original, fictional AI social-media characters for memecoin communities.
Rules:
- Never base a character on a real, identifiable person (celebrities, politicians, founders, streamers, private individuals), their name, nickname or likeness. If the request does, set impersonatesRealPerson=true and still return a harmless placeholder character.
- Characters may be animals, objects, creatures or invented humans, always clearly fictional.
- No financial promises, price talk or investment language anywhere in the sheet.
- Keep it fun, specific and safe for TikTok and Instagram community guidelines.`;

export async function generatePersona(input: PersonaInput): Promise<PersonaResult> {
  const pre = checkImpersonation(input.sentence, input.tokenName, input.tokenSymbol);
  if (!pre.ok) return { ok: false, guard: pre };

  if (claudeEnabled()) {
    const out = await generateStructured({
      schema: CharacterSchema,
      system: SYSTEM,
      prompt: `Token: ${input.tokenName} ($${input.tokenSymbol}).\nCreator's one-sentence persona: """${input.sentence.slice(0, 400)}"""\nWrite the character sheet. 3-5 recurring locations, 2-3 catchphrases.`,
      maxTokens: 4000,
    });
    if (out) {
      if (out.impersonatesRealPerson) {
        return { ok: false, guard: { ok: false, match: out.realPersonName, reason: `This looks like a real person${out.realPersonName ? ` (${out.realPersonName})` : ""}. Personas must be original characters.` } };
      }
      const c = out.character;
      const character: CharacterSheet = {
        ...c,
        handle: c.handle.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 20) || templateCharacter(input).handle,
        recurringLocations: c.recurringLocations.slice(0, 6),
        catchphrases: c.catchphrases.slice(0, 4),
        palette: c.palette.filter((h) => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 3).concat(templateCharacter(input).palette).slice(0, 3),
      };
      const post = checkImpersonation(character.name, character.look, character.backstory);
      if (!post.ok) return { ok: false, guard: post };
      return { ok: true, guard: { ok: true }, character, source: "claude" };
    }
  }
  const character = templateCharacter(input);
  return { ok: true, guard: { ok: true }, character, source: "template" };
}
