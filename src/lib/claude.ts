/**
 * Thin wrapper around the Anthropic SDK for structured (Zod-validated) generations.
 * Uses Claude Opus 5.5 with server-side refusal fallbacks enabled. Returns null on refusal
 * or error so callers can fall back to the deterministic template generator.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { config } from "./config";

let client: Anthropic | null = null;

export function claudeEnabled(): boolean {
  return !!config.anthropicKey();
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey(), timeout: 90_000, maxRetries: 2 });
  return client;
}

export async function generateStructured<T extends z.ZodType>(opts: {
  schema: T;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<z.infer<T> | null> {
  if (!claudeEnabled()) return null;
  try {
    const response = await getClient().beta.messages.parse({
      model: config.anthropicModel(),
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: "medium", format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.prompt }],
    });
    if (response.stop_reason === "refusal") {
      console.warn("[glowpad] Claude declined the request", response.stop_details?.category ?? "");
      return null;
    }
    return (response.parsed_output as z.infer<T> | null) ?? null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[glowpad] Claude rate limited; using template fallback");
    else if (err instanceof Anthropic.APIError) console.warn(`[glowpad] Claude API error ${err.status}: ${err.message}`);
    else console.warn("[glowpad] Claude call failed:", err);
    return null;
  }
}
