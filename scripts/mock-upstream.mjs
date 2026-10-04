/**
 * Local test double for pump.fun + DexScreener + pump.fun IPFS used in end-to-end verification.
 * - Mints listed in SIMULATED are served from memory; POST /__graduate/<mint> flips them to graduated.
 * - Every other request is proxied to the real upstream, so real tokens still resolve.
 * Usage: node scripts/mock-upstream.mjs  (port 4010)
 *   PUMP_API_BASE=http://localhost:4010/pump DEXSCREENER_API_BASE=http://localhost:4010/dex PUMP_IPFS_URL=http://localhost:4010/ipfs
 */
import http from "node:http";

const SIM_MINT = process.env.SIM_MINT || "GLoWSimMint1111111111111111111111111111pump";
const state = new Map([[SIM_MINT, { graduated: false }]]);

const coin = (mint, s) => ({
  mint,
  name: "Marlo the Moth",
  symbol: "MARLO",
  program: "pump",
  image_uri: null,
  complete: s.graduated,
  pump_swap_pool: s.graduated ? "SimPool111111111111111111111111111111111111" : null,
  real_token_reserves: s.graduated ? 0 : 190_000_000_000_000,
  usd_market_cap: s.graduated ? 92000 : 31000,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (req.method === "POST" && url.pathname.startsWith("/__graduate/")) {
    const m = url.pathname.split("/")[2];
    state.set(m, { graduated: true });
    return send(200, { ok: true, mint: m });
  }
  if (req.method === "POST" && url.pathname === "/__reset") {
    for (const k of state.keys()) state.set(k, { graduated: false });
    return send(200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/ipfs") {
    req.resume();
    return send(200, { metadataUri: "https://ipfs.io/ipfs/bafkreifhy7voj4emntbkyu4ba2giybetrkoewmlxi4cdw5oj3laff6opcu", metadata: { image: null } });
  }
  let m = url.pathname.match(/^\/pump\/coins(?:-v2)?\/([^/]+)$/);
  if (m && state.has(m[1])) return send(200, coin(m[1], state.get(m[1])));
  m = url.pathname.match(/^\/dex\/tokens\/v1\/solana\/([^/]+)$/);
  if (m && state.has(m[1])) {
    const s = state.get(m[1]);
    return send(200, [{ chainId: "solana", dexId: s.graduated ? "pumpswap" : "pumpfun", pairAddress: "SimPair", baseToken: { address: m[1], name: "Marlo the Moth", symbol: "MARLO" }, liquidity: { usd: s.graduated ? 40000 : 0 }, marketCap: s.graduated ? 92000 : 31000 }]);
  }
  // passthrough
  const target = url.pathname.startsWith("/pump/") ? `https://frontend-api-v3.pump.fun${url.pathname.slice(5)}${url.search}` : url.pathname.startsWith("/dex/") ? `https://api.dexscreener.com${url.pathname.slice(4)}${url.search}` : null;
  if (!target) return send(404, { error: "not mocked" });
  try {
    const r = await fetch(target, { headers: { accept: "application/json" } });
    send(r.status, await r.text(), r.headers.get("content-type") || "application/json");
  } catch (e) {
    send(502, { error: String(e) });
  }
});
server.listen(Number(process.env.PORT || 4010), () => console.log(`mock upstream on :${process.env.PORT || 4010}, simulated mint ${SIM_MINT}`));
