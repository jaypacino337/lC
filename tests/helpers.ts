import { createPglite } from "@/lib/db/client";
import type { DB } from "@/lib/db/client";

export async function testDb(): Promise<DB> {
  return createPglite();
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Records every request and answers from a list of [matcher, handler] routes. */
export function mockFetch(routes: [RegExp | string, Handler][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const [m, h] of routes) {
      if (typeof m === "string" ? url.startsWith(m) : m.test(url)) return h(url, init);
    }
    return new Response(JSON.stringify({ error: "unmocked", url }), { status: 404 });
  };
  return { f, calls };
}

export const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
