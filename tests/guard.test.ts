import { describe, expect, it } from "vitest";
import { checkCaption, checkImpersonation, sanitizeCaption, withAiDisclosure } from "@/lib/guard";

describe("impersonation guard", () => {
  it.each([
    "Elon Musk but as a frog",
    "a cat that talks exactly like Taylor Swift",
    "TRUMP doing street interviews",
    "MrBeast giving away cars",
    "a deepfake of my favourite streamer",
    "a celebrity rapper from Atlanta",
    "Ronaldo's lookalike goalkeeper",
  ])("blocks %s", (s) => {
    expect(checkImpersonation(s).ok).toBe(false);
  });
  it.each(["a frog who loves road trips", "a moth obsessed with ring lights", "a grumpy toaster who reviews breakfast spots", "a cheetah obsessed with speed"])("allows %s", (s) => {
    expect(checkImpersonation(s).ok).toBe(true);
  });
  it("ignores accents and punctuation tricks", () => {
    expect(checkImpersonation("B-e-y-o-n-c-é").ok).toBe(true); // split letters aren't a name
    expect(checkImpersonation("Beyoncé's twin").ok).toBe(false);
  });
});

describe("caption filter", () => {
  it.each(["this is going 100x", "we're mooning", "market cap is wild", "buy now", "$5 to $500", "guaranteed gains", "not financial advice, just vibes"])("blocks %s", (s) => {
    expect(checkCaption(s).ok).toBe(false);
  });
  it("allows normal in-character posts", () => {
    expect(checkCaption("leg day. still showed up, that's the whole post.").ok).toBe(true);
  });
  it("sanitizes sentence by sentence and keeps cashtags", () => {
    expect(sanitizeCaption("Rooftop at golden hour. Chart looks insane. $MOTH")).toBe("Rooftop at golden hour. $MOTH");
    expect(sanitizeCaption("Buy now. 100x soon.")).toBeNull();
  });
});

describe("AI disclosure", () => {
  it("adds the platform tag once and respects X's 280 limit", () => {
    const long = "a".repeat(400);
    const x = withAiDisclosure("x", long);
    expect(x.length).toBeLessThanOrEqual(280);
    expect(x.endsWith("(AI-generated character)")).toBe(true);
    expect(withAiDisclosure("tiktok", withAiDisclosure("tiktok", "hi")).match(/#AIgenerated/g)).toHaveLength(1);
  });
});
