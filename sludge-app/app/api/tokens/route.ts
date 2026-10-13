import { NextResponse } from "next/server";
import { listTokens } from "@/lib/dex";

export const revalidate = 30;

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") === "new" ? "new" : "trending";
  try {
    const tokens = await listTokens(kind);
    return NextResponse.json({ kind, tokens, at: Date.now() });
  } catch (err) {
    // honest failure: the UI shows "data unavailable", never stale-as-live or invented numbers
    return NextResponse.json({ kind, tokens: [], error: (err as Error).message, at: Date.now() }, { status: 502 });
  }
}
