/**
 * Builds and validates the PumpPortal "create" request. The server never sees a private key:
 * the browser generates the mint keypair and sends only its PUBLIC key; the returned transaction is
 * unsigned and is signed in the browser by the mint keypair + the user's wallet.
 */
import * as z from "zod";
import { isSolanaAddress } from "../solana/address";
import { ALLOWED_IMAGE_TYPES, DEFAULT_PRIORITY_FEE_SOL, DEFAULT_SLIPPAGE_PCT, MAX_DEV_BUY_SOL, MAX_IMAGE_BYTES } from "./constants";

const addr = z.string().refine(isSolanaAddress, "must be a Solana public key");

export const CreateTxRequest = z.object({
  publicKey: addr,
  mint: addr,
  name: z.string().trim().min(1).max(32),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "letters and digits only"),
  uri: z.string().url().refine((u) => u.startsWith("https://"), "metadata URI must be https"),
  devBuySol: z.number().min(0).max(MAX_DEV_BUY_SOL).default(0),
  slippage: z.number().min(1).max(50).default(DEFAULT_SLIPPAGE_PCT),
  priorityFee: z.number().min(0).max(0.01).default(DEFAULT_PRIORITY_FEE_SOL),
});
export type CreateTxRequest = z.infer<typeof CreateTxRequest>;

export function buildCreatePayload(r: CreateTxRequest) {
  if (r.publicKey === r.mint) throw new Error("mint must be a fresh keypair, not the wallet");
  return {
    publicKey: r.publicKey,
    action: "create" as const,
    tokenMetadata: { name: r.name, symbol: r.symbol.toUpperCase(), uri: r.uri },
    mint: r.mint,
    denominatedInSol: "true",
    amount: r.devBuySol,
    slippage: r.slippage,
    priorityFee: r.priorityFee,
    pool: "pump" as const,
  };
}

export const MetadataFields = z.object({
  name: z.string().trim().min(1).max(32),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/),
  description: z.string().trim().max(500).default(""),
  twitter: z.string().trim().url().max(200).optional().or(z.literal("")),
  telegram: z.string().trim().url().max(200).optional().or(z.literal("")),
  website: z.string().trim().url().max(200).optional().or(z.literal("")),
});
export type MetadataFields = z.infer<typeof MetadataFields>;

export function validateImage(file: { type: string; size: number } | null): string | null {
  if (!file) return "An image is required.";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Image must be PNG, JPEG, GIF or WebP.";
  if (file.size > MAX_IMAGE_BYTES) return `Image must be under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  if (file.size < 100) return "Image file looks empty.";
  return null;
}

/** multipart form for pump.fun's IPFS endpoint (file + metadata fields, showName=true). */
export function buildIpfsForm(fields: MetadataFields, file: Blob, filename = "image"): FormData {
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("name", fields.name);
  fd.append("symbol", fields.symbol.toUpperCase());
  fd.append("description", fields.description ?? "");
  fd.append("twitter", fields.twitter ?? "");
  fd.append("telegram", fields.telegram ?? "");
  fd.append("website", fields.website ?? "");
  fd.append("showName", "true");
  return fd;
}

/** Cost summary shown before signing. All values in SOL; the PumpPortal fee applies only to the dev buy. */
export function costSummary(devBuySol: number, priorityFeeSol: number, networkEstimateSol: number) {
  const portalFee = (devBuySol * 0.5) / 100;
  return {
    devBuy: devBuySol,
    portalFee,
    priorityFee: priorityFeeSol,
    network: networkEstimateSol,
    total: devBuySol + portalFee + priorityFeeSol + networkEstimateSol,
  };
}
