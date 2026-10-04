import { describe, expect, it } from "vitest";
import { generatePersona, parseSentence, templateCharacter } from "@/lib/content/persona";
import { CharacterSheetSchema } from "@/lib/content/schema";

describe("persona generation fallback (no ANTHROPIC_API_KEY)", () => {
  it("parses subject and trait from one sentence", () => {
    expect(parseSentence("A frog who loves road trips.")).toEqual({ subject: "frog", trait: "who loves road trips" });
  });
  it("is deterministic and schema-valid", () => {
    const input = { sentence: "a moth obsessed with ring lights", tokenName: "Moth", tokenSymbol: "MOTH" };
    const a = templateCharacter(input);
    expect(templateCharacter(input)).toEqual(a);
    expect(CharacterSheetSchema.safeParse(a).success).toBe(true);
    expect(a.name).toBe("Moth");
    expect(a.recurringLocations.length).toBeGreaterThanOrEqual(3);
    expect(a.look).toMatch(/moth/);
  });
  it("uses the template when no key is configured", async () => {
    const r = await generatePersona({ sentence: "a frog who loves road trips", tokenName: "Pepo", tokenSymbol: "PEPO" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("template");
    expect(r.character?.name).toBe("Pepo");
  });
  it("blocks real people before generating anything", async () => {
    const r = await generatePersona({ sentence: "Elon but he's a dog", tokenName: "Doge", tokenSymbol: "DOGE" });
    expect(r.ok).toBe(false);
    expect(r.guard.reason).toMatch(/real people/);
  });
});
