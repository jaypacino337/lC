"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, Dices, ExternalLink, ImagePlus, Loader2, Wallet } from "lucide-react";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { GooButton } from "@/components/goo/GooButton";
import { blobPNG, brew, drawBlob, type Brew } from "@/lib/brewer";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { VatShader } from "./VatShader";

type Phantom = {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
};

function provider(): Phantom | null {
  const w = window as unknown as { phantom?: { solana?: Phantom }; solana?: Phantom };
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}

const b64 = {
  decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  encode: (u: Uint8Array) => {
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  },
};

type Stage = "idle" | "pin" | "sign" | "pour" | "live" | "err";
const STAGES: { k: Exclude<Stage, "idle" | "err">; label: string }[] = [
  { k: "pin", label: "Pin to IPFS" },
  { k: "sign", label: "Sign in Phantom" },
  { k: "pour", label: "Pour on-chain" },
  { k: "live", label: "Batch logged" },
];
const DEV_BUYS = [0, 0.1, 0.5, 1];

export function BrewForm() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [nonce, setNonce] = useState(0);
  const [brewed, setBrewed] = useState<Brew | null>(null);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [devBuy, setDevBuy] = useState("0");
  const [socials, setSocials] = useState({ twitter: "", telegram: "", website: "" });
  const [image, setImage] = useState<{ blob: Blob; url: string; kind: "upload" | "creature" } | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<{ msg: string; mint?: string; signature?: string; logged?: boolean } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // keep object URLs from leaking
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  // draw the creature whenever a brew changes
  useEffect(() => {
    if (brewed && canvas.current && image?.kind !== "upload") drawBlob(canvas.current, brewed.seed);
  }, [brewed, image?.kind]);

  async function letTheVatDecide(reroll = false) {
    const n = reroll ? nonce + 1 : nonce;
    setNonce(n);
    const b = brew(idea, n);
    setBrewed(b);
    setName(b.name);
    setTicker(b.ticker);
    setDescription(b.thesis);
    if (image?.kind !== "upload") {
      const png = await blobPNG(b.seed);
      if (png) setImage({ blob: png, url: URL.createObjectURL(png), kind: "creature" });
    }
  }

  async function connect() {
    const p = provider();
    if (!p) {
      // on phones, open this page inside Phantom's in-app browser
      const mobile = /android|iphone|ipad/i.test(navigator.userAgent);
      const here = encodeURIComponent(window.location.href);
      window.open(mobile ? `https://phantom.app/ul/browse/${here}?ref=${encodeURIComponent(window.location.origin)}` : "https://phantom.app/", "_blank", "noopener");
      return;
    }
    try {
      const { publicKey } = await p.connect();
      setWallet(publicKey.toBase58());
    } catch {
      /* user closed the popup */
    }
  }

  const ingredients = [!!name.trim(), !!ticker, !!image, devBuy !== ""];
  const level = ingredients.filter(Boolean).length;
  const busy = stage === "pin" || stage === "sign" || stage === "pour";

  async function pour(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const p = provider();
    if (!p || !wallet) {
      setStage("err");
      setResult({ msg: "Connect Phantom first. The vat only pours for a wallet that signs." });
      return;
    }
    if (!image) {
      setStage("err");
      setResult({ msg: "The vat needs an image: upload one or let the vat draw a creature." });
      return;
    }
    // The mint keypair is generated HERE, in the browser, and only ever signs this one tx.
    const mint = Keypair.generate();
    const form = new FormData();
    form.set("name", name.trim());
    form.set("symbol", ticker);
    form.set("description", description.trim());
    form.set("devBuy", devBuy || "0");
    form.set("image", image.blob, image.kind === "creature" ? "creature.png" : "image");
    Object.entries(socials).forEach(([k, v]) => v.trim() && form.set(k, v.trim()));
    form.set("publicKey", wallet);
    form.set("mint", mint.publicKey.toBase58());
    try {
      setStage("pin");
      const res = await fetch("/api/create", { method: "POST", body: form });
      const json = (await res.json()) as { tx?: string; error?: string };
      if (!res.ok || !json.tx) throw new Error(json.error ?? "The vat couldn’t build the transaction.");

      setStage("sign");
      const tx = VersionedTransaction.deserialize(b64.decode(json.tx));
      tx.sign([mint]);
      const signed = await p.signTransaction(tx);

      setStage("pour");
      const sent = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx: b64.encode(signed.serialize()), mint: mint.publicKey.toBase58() }),
      });
      const out = (await sent.json()) as { signature?: string; logged?: boolean; error?: string };
      if (!sent.ok) throw new Error(out.error ?? "The pour failed.");
      setStage("live");
      setResult({
        msg: out.logged ? `$${ticker} is live and logged as a batch.` : `$${ticker} is live on-chain, but the batch log didn’t record it.`,
        mint: mint.publicKey.toBase58(),
        signature: out.signature,
        logged: out.logged,
      });
    } catch (err) {
      setStage("err");
      const m = (err as Error).message;
      setResult({ msg: /reject|cancel/i.test(m) ? "You cancelled in Phantom. Nothing was sent." : m });
    }
  }

  const field =
    "w-full rounded-2xl border border-line bg-bg/70 px-4 py-3 outline-none transition placeholder:text-muted/70 focus:border-brand/70 focus:shadow-[0_0_0_4px_rgb(184_255_31/0.14)]";
  const stageIdx = STAGES.findIndex((s) => s.k === stage);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      {/* ── the vat ───────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-24">
        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <div className="absolute inset-0 overflow-hidden rounded-[46%_54%_50%_50%/55%_50%_50%_45%] border-2 border-brand/40 bg-bg shadow-[inset_0_-40px_80px_-20px_rgb(184_255_31/0.25),0_0_80px_-30px_var(--color-brand)]">
            <VatShader level={level} />
            <div className="absolute inset-0 bg-[radial-gradient(closest-side,transparent_55%,var(--color-bg)_100%)]" />
          </div>
          {/* the specimen floats in the middle */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative grid size-[48%] animate-float place-items-center">
              {image?.kind === "upload" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="Your coin image" className="size-full animate-wobble object-cover shadow-[0_20px_60px_-10px_rgb(0_0_0/0.8)] ring-4 ring-brand" />
              ) : brewed ? (
                <canvas ref={canvas} width={520} height={560} className="size-full drop-shadow-[0_20px_40px_rgb(0_0_0/0.6)]" aria-label={`The creature brewed for ${brewed.name}`} />
              ) : (
                <div className="grid size-full animate-wobble place-items-center bg-bg/70 p-6 text-center backdrop-blur-sm">
                  <span className="font-display text-xl leading-tight text-brand">add ingredients</span>
                </div>
              )}
            </div>
          </div>
          {/* ticker label stuck on the vat */}
          <AnimatePresence>
            {ticker && (
              <motion.span
                key={ticker}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: -8 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="absolute top-[8%] right-[4%] rounded-full bg-accent px-4 py-2 font-display text-xl text-ink shadow-lg"
              >
                ${ticker}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* ingredient checklist */}
        <ul className="mx-auto mt-6 grid max-w-[34rem] grid-cols-4 gap-2" aria-label="Ingredients">
          {site.ingredients.map((g, i) => (
            <li key={g.k} className={cn("rounded-2xl border px-2 py-2 text-center transition-colors", ingredients[i] ? "border-brand/60 bg-brand/10" : "border-line")}>
              <span className={cn("mx-auto grid size-6 place-items-center rounded-full transition-colors", ingredients[i] ? "bg-brand text-ink" : "bg-white/5 text-muted")}>
                {ingredients[i] ? <Check className="size-4" /> : <span className="size-1.5 rounded-full bg-muted" />}
              </span>
              <span className="mt-1 block font-mono text-[10px] tracking-[0.12em] text-muted">{g.k}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── the ingredients form ─────────────────────────────── */}
      <form onSubmit={pour} className="rounded-[2.25rem] vat-panel p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="slime-type text-4xl text-fg sm:text-5xl">Brew a coin</h1>
          <button
            type="button"
            onClick={connect}
            className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-xs transition", wallet ? "border-brand/60 bg-brand/10 text-brand" : "border-line bg-white/5 hover:border-brand/60")}
          >
            <Wallet className="size-4" />
            {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "Connect Phantom"}
          </button>
        </div>
        <p className="mt-3 text-sm text-pretty text-muted">Every field is an ingredient. Fill them yourself, or feed the vat an idea and let it brew a name, ticker, description and creature you can tweak.</p>

        {/* let the vat decide */}
        <div className="mt-6 rounded-3xl border border-dashed border-accent/50 bg-accent/5 p-4">
          <label htmlFor="idea" className="font-mono text-[11px] tracking-[0.16em] text-accent uppercase">
            Feed the vat an idea (optional)
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={60} placeholder="a raccoon that day-trades from a dumpster" className={field} />
            <div className="flex shrink-0 gap-2">
              <GooButton variant="purple" onClick={() => letTheVatDecide(false)} className="flex-1 sm:flex-none">
                <Dices className="size-4" /> Let the vat decide
              </GooButton>
              {brewed && (
                <button type="button" onClick={() => letTheVatDecide(true)} aria-label="Brew again" className="grid size-12 shrink-0 place-items-center rounded-full border border-line transition hover:border-accent hover:text-accent">
                  <Dices className="size-5" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">A seeded generator in your browser, not an AI. Same idea, same coin.</p>
        </div>

        <div className="mt-6 space-y-4">
          <label className="group flex cursor-pointer items-center gap-4 rounded-3xl border border-dashed border-line p-4 transition hover:border-brand/60">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[40%] bg-white/5">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="Coin image preview" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-7 text-muted transition group-hover:scale-110 group-hover:text-brand" />
              )}
            </span>
            <span className="text-sm">
              <span className="block font-display text-lg">Image</span>
              <span className="text-muted">{image?.kind === "creature" ? "Using the vat’s creature. Click to upload your own." : "PNG, JPG, GIF or WEBP, up to 4 MB. Square looks best."}</span>
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImage({ blob: f, url: URL.createObjectURL(f), kind: "upload" });
              }}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Name</span>
              <input required maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="GLORPLORD" className={field} />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Ticker</span>
              <input required maxLength={10} value={ticker} onChange={(e) => setTicker(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} placeholder="GLRP" className={cn(field, "font-mono")} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Description</span>
            <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What crawled out of the vat?" className={field} />
          </label>

          <fieldset>
            <legend className="mb-1.5 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Dev buy (SOL)</legend>
            <div className="flex flex-wrap items-center gap-2">
              {DEV_BUYS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDevBuy(String(v))}
                  className={cn("rounded-full border px-4 py-2 font-mono text-sm transition", Number(devBuy) === v && devBuy !== "" ? "border-brand bg-brand text-ink" : "border-line hover:border-brand/60")}
                >
                  {v}
                </button>
              ))}
              <input
                type="number"
                min={0}
                max={50}
                step="0.01"
                value={devBuy}
                onChange={(e) => setDevBuy(e.target.value)}
                aria-label="Dev buy in SOL"
                className={cn(field, "w-28 flex-none py-2 font-mono")}
              />
            </div>
          </fieldset>

          <details className="group rounded-3xl border border-line px-4 py-3">
            <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.14em] text-muted uppercase">+ Socials (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(["twitter", "telegram", "website"] as const).map((k) => (
                <input key={k} type="url" value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} placeholder={k === "twitter" ? "X link" : k === "telegram" ? "Telegram" : "Website"} aria-label={k} className={field} />
              ))}
            </div>
          </details>
        </div>

        <div className="mt-7">
          <GooButton type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-5 animate-spin" /> : null}
            {busy ? STAGES[stageIdx]?.label + "…" : `Pour it${ticker ? ` · $${ticker}` : ""}`}
          </GooButton>
        </div>

        {/* pour progress */}
        {stage !== "idle" && stage !== "err" && (
          <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Launch progress">
            {STAGES.map((s, i) => (
              <li key={s.k} className="text-center">
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: i < stageIdx || stage === "live" ? "100%" : i === stageIdx ? "55%" : "0%" }} />
                </div>
                <span className="mt-1 block font-mono text-[10px] text-muted">{s.label}</span>
              </li>
            ))}
          </ol>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className={cn("mt-5 rounded-3xl p-5 text-sm", stage === "live" ? "bg-brand/12 text-brand" : "bg-accent/12 text-accent")}
            >
              <p className="font-display text-xl">{stage === "live" ? "Poured. It’s alive." : "The vat spat it back."}</p>
              <p className="mt-1">{result.msg}</p>
              {result.mint && (
                <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs">
                  <a className="inline-flex items-center gap-1 underline" href={`https://pump.fun/coin/${result.mint}`} target="_blank" rel="noopener noreferrer">
                    pump.fun <ExternalLink className="size-3" />
                  </a>
                  {result.signature && (
                    <a className="inline-flex items-center gap-1 underline" href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noopener noreferrer">
                      tx <ExternalLink className="size-3" />
                    </a>
                  )}
                  {result.logged && (
                    <a className="underline" href="/#batches">
                      see it in Batches →
                    </a>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-xs text-pretty text-muted">
          Your keys never leave your browser or wallet. Launching costs network fees, pump.fun’s creation cost and your dev buy. Most coins go to zero.
        </p>
      </form>
    </div>
  );
}
