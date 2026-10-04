"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { Avatar } from "@/components/Avatar";
import { GraduationBar } from "@/components/GraduationBar";
import { SignInGate } from "@/components/SignInGate";
import { api } from "@/lib/client";
import { EXAMPLE_CA } from "@/lib/public";
import type { CharacterSheet } from "@/lib/content/types";
import { ALLOWED_IMAGE_TYPES, DEFAULT_PRIORITY_FEE_SOL, DEFAULT_SLIPPAGE_PCT, EST_CREATE_NETWORK_COST_SOL, MAX_DEV_BUY_SOL, MAX_IMAGE_BYTES, PUMPPORTAL_FEE_PCT } from "@/lib/launch/constants";

type Mode = "launch" | "existing";
interface TokenResult {
  token: { mint: string; name: string; symbol: string; image: string | null; source: string; marketCapUsd: number | null };
  graduation: { graduated: boolean; reason: string; progress: number | null };
  existing: { slug: string } | null;
}
interface LaunchForm {
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  devBuy: string;
}

export function CreateWizard() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [step, setStep] = useState(1);
  const [token, setToken] = useState<TokenResult | null>(null);
  const [form, setForm] = useState<LaunchForm>({ name: "", symbol: "", description: "", twitter: "", telegram: "", website: "", devBuy: "0" });
  const [image, setImage] = useState<File | null>(null);
  const [sentence, setSentence] = useState("");
  const [character, setCharacter] = useState<{ c: CharacterSheet; source: string } | null>(null);

  const tokenName = mode === "launch" ? form.name : token?.token.name ?? "";
  const tokenSymbol = mode === "launch" ? form.symbol.toUpperCase() : token?.token.symbol ?? "";

  if (!mode) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <button className="card group p-7 text-left transition hover:border-amber/60" onClick={() => setMode("launch")} data-testid="mode-launch">
          <span className="text-3xl">🚀</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Launch a new token</h2>
          <p className="mt-2 text-mute">Create a pump.fun coin right here. You sign the transaction in your own wallet after a simulation and cost summary; we never touch your keys.</p>
          <span className="mt-4 inline-block font-semibold text-amber group-hover:underline">Launch on pump.fun →</span>
        </button>
        <button className="card group p-7 text-left transition hover:border-amber/60" onClick={() => setMode("existing")} data-testid="mode-existing">
          <span className="text-3xl">📋</span>
          <h2 className="mt-3 font-display text-2xl font-bold">Use an existing token</h2>
          <p className="mt-2 text-mute">Paste any Solana contract address (pump.fun or already on a DEX). Graduated coins unlock TikTok + Instagram immediately.</p>
          <span className="mt-4 inline-block font-semibold text-amber group-hover:underline">Paste a CA →</span>
        </button>
      </div>
    );
  }

  const steps = mode === "launch" ? ["Token", "Persona", "Launch"] : ["Token", "Persona", "Create"];
  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        <li>
          <button className="chip hover:border-amber" onClick={() => { setMode(null); setStep(1); }}>← Change</button>
        </li>
        {steps.map((s, k) => (
          <li key={s} className={`chip ${step === k + 1 ? "border-amber text-amber" : step > k + 1 ? "text-mint" : ""}`}>
            {step > k + 1 ? "✓" : k + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && mode === "existing" && <ExistingToken value={token} onChange={setToken} onNext={() => setStep(2)} />}
      {step === 1 && mode === "launch" && <LaunchTokenForm form={form} setForm={setForm} image={image} setImage={setImage} onNext={() => setStep(2)} />}
      {step === 2 && (
        <PersonaStep
          tokenName={tokenName}
          tokenSymbol={tokenSymbol}
          sentence={sentence}
          setSentence={setSentence}
          character={character}
          setCharacter={setCharacter}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && character && (
        <SignInGate title="Sign in to finish">
          {mode === "existing" && token ? (
            <CreateExisting token={token} sentence={sentence} character={character} onBack={() => setStep(2)} />
          ) : (
            <LaunchStep form={form} image={image!} sentence={sentence} character={character} onBack={() => setStep(2)} />
          )}
        </SignInGate>
      )}
    </div>
  );
}

function ExistingToken({ value, onChange, onNext }: { value: TokenResult | null; onChange: (t: TokenResult | null) => void; onNext: () => void }) {
  const [mint, setMint] = useState(value?.token.mint ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = async (m = mint) => {
    setError(null);
    onChange(null);
    setLoading(true);
    try {
      onChange(await api<TokenResult>(`/api/token/${encodeURIComponent(m.trim())}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="card space-y-5 p-6">
      <div>
        <label className="label" htmlFor="ca">Token contract address (mint)</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="ca" className="input font-mono text-sm" placeholder="e.g. 4ee8…npump" value={mint} onChange={(e) => setMint(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} data-testid="mint-input" />
          <button className="btn btn-glow" onClick={() => check()} disabled={loading || mint.trim().length < 32}>{loading ? "Checking…" : "Check token"}</button>
        </div>
        <button className="mt-2 text-xs text-mute hover:text-amber" onClick={() => { setMint(EXAMPLE_CA); check(EXAMPLE_CA); }}>Try an example CA</button>
      </div>
      {error && <p className="text-sm text-glow" role="alert">{error}</p>}
      {value && (
        <div className="rounded-2xl border border-line p-4" data-testid="token-result">
          <div className="flex items-center gap-3">
            {value.token.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.token.image} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-ink-3" />
            )}
            <div>
              <p className="font-display text-lg font-bold">{value.token.name}</p>
              <p className="text-sm text-amber">${value.token.symbol} <span className="text-mute">· {value.token.source === "pump" ? "pump.fun" : "DEX"}</span></p>
            </div>
          </div>
          <div className="mt-4"><GraduationBar progress={value.graduation.progress} graduated={value.graduation.graduated} /></div>
          <p className="mt-2 text-xs text-mute">{value.graduation.graduated ? "Graduated: X, TikTok and Instagram unlock right away." : `Not graduated (${value.graduation.reason}): X now, TikTok + Instagram at graduation.`}</p>
          {value.existing ? (
            <p className="mt-3 text-sm text-glow">This token already has an influencer. <a className="underline" href={`/i/${value.existing.slug}`}>View it</a></p>
          ) : (
            <button className="btn btn-glow mt-4" onClick={onNext} data-testid="token-next">Continue →</button>
          )}
        </div>
      )}
    </div>
  );
}

function LaunchTokenForm({ form, setForm, image, setImage, onNext }: { form: LaunchForm; setForm: (f: LaunchForm) => void; image: File | null; setImage: (f: File | null) => void; onNext: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof LaunchForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const devBuy = Number(form.devBuy || 0);
  const preview = image ? URL.createObjectURL(image) : null;
  const next = () => {
    if (!form.name.trim() || form.name.length > 32) return setError("Name is required (max 32 characters).");
    if (!/^[A-Za-z0-9]{1,10}$/.test(form.symbol)) return setError("Ticker: 1-10 letters or digits.");
    if (!image) return setError("Add an image for your coin.");
    if (!(devBuy >= 0 && devBuy <= MAX_DEV_BUY_SOL)) return setError(`Dev buy must be between 0 and ${MAX_DEV_BUY_SOL} SOL.`);
    for (const k of ["twitter", "telegram", "website"] as const) if (form[k] && !/^https:\/\//.test(form[k])) return setError(`${k} must be a full https:// link.`);
    setError(null);
    onNext();
  };
  return (
    <div className="card grid gap-6 p-6 md:grid-cols-[1fr_220px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="tn">Name</label><input id="tn" className="input" maxLength={32} value={form.name} onChange={set("name")} placeholder="Marlo the Moth" /></div>
          <div><label className="label" htmlFor="tt">Ticker</label><input id="tt" className="input uppercase" maxLength={10} value={form.symbol} onChange={set("symbol")} placeholder="MARLO" /></div>
        </div>
        <div><label className="label" htmlFor="td">Description</label><textarea id="td" className="input min-h-20" maxLength={500} value={form.description} onChange={set("description")} placeholder="What's the story?" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="tx">X / Twitter (optional)</label><input id="tx" className="input" value={form.twitter} onChange={set("twitter")} placeholder="https://x.com/…" /></div>
          <div><label className="label" htmlFor="tg">Telegram (optional)</label><input id="tg" className="input" value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/…" /></div>
          <div><label className="label" htmlFor="tw">Website (optional)</label><input id="tw" className="input" value={form.website} onChange={set("website")} placeholder="https://…" /></div>
        </div>
        <div>
          <label className="label" htmlFor="db">Initial dev buy (SOL) · optional, max {MAX_DEV_BUY_SOL}</label>
          <input id="db" className="input" type="number" min={0} max={MAX_DEV_BUY_SOL} step="0.01" value={form.devBuy} onChange={set("devBuy")} />
          <p className={`mt-1.5 text-xs ${devBuy > 0 ? "text-amber" : "text-mute"}`}>
            {devBuy > 0
              ? `⚠ You'll buy ~${devBuy} SOL of your own coin in the launch transaction. This is real money and can go to zero. PumpPortal charges ${PUMPPORTAL_FEE_PCT}% on it and pump.fun's trading fee applies.`
              : "Default 0: no buy, just create the coin."}
          </p>
        </div>
        {error && <p className="text-sm text-glow" role="alert">{error}</p>}
        <button className="btn btn-glow" onClick={next}>Continue →</button>
      </div>
      <div>
        <span className="label">Image</span>
        <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-ink-2 text-center text-sm text-mute hover:border-amber">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Token preview" className="h-full w-full object-cover" />
          ) : (
            <span className="p-4">Click to upload<br />PNG, JPG, GIF, WebP · max {MAX_IMAGE_BYTES / 1024 / 1024} MB</span>
          )}
          <input type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && (!ALLOWED_IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES)) { setError("Image must be PNG/JPG/GIF/WebP under 4 MB."); return; }
            setImage(f);
          }} />
        </label>
      </div>
    </div>
  );
}

function PersonaStep(p: {
  tokenName: string; tokenSymbol: string; sentence: string; setSentence: (s: string) => void;
  character: { c: CharacterSheet; source: string } | null; setCharacter: (c: { c: CharacterSheet; source: string } | null) => void; onBack: () => void; onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ character: CharacterSheet; source: string }>("/api/persona", { method: "POST", json: { sentence: p.sentence, tokenName: p.tokenName, tokenSymbol: p.tokenSymbol } });
      p.setCharacter({ c: r.character, source: r.source });
    } catch (e) {
      p.setCharacter(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const c = p.character?.c;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="card space-y-4 p-6">
        <label className="label" htmlFor="persona">Describe your character in one sentence</label>
        <textarea id="persona" className="input min-h-28 text-lg" maxLength={300} value={p.sentence} onChange={(e) => p.setSentence(e.target.value)} placeholder="a frog who loves road trips and rates every gas station snack" data-testid="persona-input" />
        <p className="text-xs text-mute">Original characters only: no real people, celebrities or their likeness. Animals, objects and invented humans are perfect.</p>
        <div className="flex flex-wrap gap-2">
          {["a moth obsessed with ring lights and late-night diners", "a cactus DJ who only plays desert sunrise sets", "a penguin travel vlogger who is cold in every country"].map((s) => (
            <button key={s} className="chip hover:border-amber" onClick={() => p.setSentence(s)}>{s.split(" ").slice(0, 4).join(" ")}…</button>
          ))}
        </div>
        {error && <p className="text-sm text-glow" role="alert" data-testid="persona-error">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={p.onBack}>← Back</button>
          <button className="btn btn-glow" onClick={gen} disabled={loading || p.sentence.trim().length < 4} data-testid="persona-generate">{loading ? "Giving it a soul…" : c ? "Regenerate" : "Generate persona"}</button>
        </div>
      </div>
      <div className="card p-6" data-testid="persona-preview">
        {c ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar seed={hashSeed(c.name + p.tokenSymbol)} palette={c.palette} size={80} className="h-20 w-20 rounded-2xl" />
              <div>
                <p className="font-display text-2xl font-extrabold">{c.name}</p>
                <p className="text-amber">${p.tokenSymbol || "TICKER"} <span className="text-mute">· @{c.handle}</span></p>
              </div>
            </div>
            <p className="text-mute">{c.tagline}</p>
            <dl className="grid gap-3 text-sm">
              <div><dt className="label">Look</dt><dd>{c.look}</dd></div>
              <div><dt className="label">Voice</dt><dd>{c.voice}</dd></div>
              <div><dt className="label">Backstory</dt><dd>{c.backstory}</dd></div>
              <div><dt className="label">Posting style</dt><dd>{c.postingStyle}</dd></div>
              <div><dt className="label">Recurring places</dt><dd className="flex flex-wrap gap-1.5">{c.recurringLocations.map((l) => <span key={l} className="chip">{l}</span>)}</dd></div>
            </dl>
            <p className="text-xs text-mute">Written by {p.character?.source === "claude" ? "Claude" : "the built-in template (no AI key configured)"}.</p>
            <button className="btn btn-glow" onClick={p.onNext} data-testid="persona-next">Looks good →</button>
          </div>
        ) : (
          <div className="flex h-full min-h-60 flex-col items-center justify-center text-center text-mute">
            <p className="font-display text-xl text-cream">Your character sheet appears here</p>
            <p className="mt-1 text-sm">Name, look, voice, backstory, posting style and favourite places.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function hashSeed(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100000;
}

function CreateExisting({ token, sentence, character, onBack }: { token: TokenResult; sentence: string; character: { c: CharacterSheet; source: string }; onBack: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/influencers", { method: "POST", json: { mint: token.token.mint, personaPrompt: sentence, character: character.c, characterSource: character.source } });
      router.push(`/dashboard/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };
  return (
    <div className="card space-y-4 p-6">
      <h2 className="font-display text-2xl font-bold">Bring {character.c.name} to life</h2>
      <p className="text-mute">{character.c.name} will represent <b className="text-cream">${token.token.symbol}</b>. You can connect X next{token.graduation.graduated ? ", plus TikTok and Instagram" : "; TikTok and Instagram unlock at graduation"}.</p>
      {error && <p className="text-sm text-glow" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-glow" onClick={create} disabled={loading} data-testid="create-submit">{loading ? "Creating…" : "Create influencer"}</button>
      </div>
    </div>
  );
}

type Prepared = { tx: VersionedTransaction; mint: Keypair; metadataUri: string; image: string | null; sim: { ok: boolean; err: string | null; units?: number }; balance: number };

function LaunchStep({ form, image, sentence, character, onBack }: { form: LaunchForm; image: File; sentence: string; character: { c: CharacterSheet; source: string }; onBack: () => void }) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [phase, setPhase] = useState<"idle" | "preparing" | "ready" | "signing" | "confirming" | "verifying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const prepared = useRef<Prepared | null>(null);
  const meta = useRef<{ metadataUri: string; image: string | null } | null>(null);
  const devBuy = Number(form.devBuy || 0);
  const portalFee = (devBuy * PUMPPORTAL_FEE_PCT) / 100;
  const total = devBuy + portalFee + DEFAULT_PRIORITY_FEE_SOL + EST_CREATE_NETWORK_COST_SOL;

  const prepare = async () => {
    if (!publicKey) return;
    setError(null);
    setPhase("preparing");
    try {
      if (!meta.current) {
        const fd = new FormData();
        fd.append("file", image);
        for (const k of ["name", "symbol", "description", "twitter", "telegram", "website"] as const) fd.append(k, k === "symbol" ? form.symbol.toUpperCase() : form[k]);
        meta.current = await api<{ metadataUri: string; image: string | null }>("/api/launch/ipfs", { method: "POST", body: fd });
      }
      // The mint keypair is generated and kept only in this browser tab.
      const mint = prepared.current?.mint ?? Keypair.generate();
      const r = await api<{ tx: string }>("/api/launch/tx", {
        method: "POST",
        json: { publicKey: publicKey.toBase58(), mint: mint.publicKey.toBase58(), name: form.name, symbol: form.symbol.toUpperCase(), uri: meta.current.metadataUri, devBuySol: devBuy, slippage: DEFAULT_SLIPPAGE_PCT, priorityFee: DEFAULT_PRIORITY_FEE_SOL },
      });
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(r.tx), (ch) => ch.charCodeAt(0)));
      const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
      if (keys[0] !== publicKey.toBase58() || !keys.includes(mint.publicKey.toBase58())) throw new Error("Unexpected transaction from PumpPortal (fee payer or mint mismatch). Aborted.");
      const [simRes, balance] = await Promise.all([connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true }), connection.getBalance(publicKey)]);
      const errStr = simRes.value.err ? JSON.stringify(simRes.value.err) : null;
      prepared.current = { tx, mint, metadataUri: meta.current.metadataUri, image: meta.current.image, sim: { ok: !errStr, err: errStr, units: simRes.value.unitsConsumed }, balance: balance / LAMPORTS_PER_SOL };
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
    }
  };

  const launch = async () => {
    const p = prepared.current;
    if (!p || !signTransaction || !publicKey) return;
    setError(null);
    try {
      setPhase("signing");
      p.tx.sign([p.mint]);
      const signed = await signTransaction(p.tx);
      setPhase("confirming");
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
      setSig(signature);
      const start = Date.now();
      for (;;) {
        const st = await connection.getSignatureStatuses([signature]);
        const s = st.value[0];
        if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
        if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) break;
        if (Date.now() - start > 90_000) throw new Error("Timed out waiting for confirmation. Check the transaction on Solscan.");
        await new Promise((r) => setTimeout(r, 2000));
      }
      setPhase("verifying");
      const r = await api<{ id: string }>("/api/launch/complete", {
        method: "POST",
        json: { signature, mint: p.mint.publicKey.toBase58(), name: form.name, symbol: form.symbol.toUpperCase(), image: p.image, personaPrompt: sentence, character: character.c, characterSource: character.source },
      });
      setPhase("done");
      router.push(`/dashboard/${r.id}?launched=1`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/blockhash/i.test(msg) ? "The transaction expired before it was signed. Prepare it again." : msg.includes("reject") ? "You rejected the signature. Nothing was sent." : msg);
      setPhase(sig ? "confirming" : "idle");
    }
  };

  const p = prepared.current;
  return (
    <div className="card space-y-5 p-6" data-testid="launch-step">
      <h2 className="font-display text-2xl font-bold">Launch ${form.symbol.toUpperCase()} on pump.fun</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 rounded-2xl border border-line p-4 text-sm">
          <p className="label">Cost summary (estimate)</p>
          <Row k="Network rent + fees" v={`~${EST_CREATE_NETWORK_COST_SOL} SOL`} />
          <Row k="Priority fee" v={`${DEFAULT_PRIORITY_FEE_SOL} SOL`} />
          <Row k="Dev buy" v={`${devBuy} SOL`} />
          <Row k={`PumpPortal fee (${PUMPPORTAL_FEE_PCT}% of dev buy)`} v={`${portalFee.toFixed(4)} SOL`} />
          <div className="border-t border-line pt-1"><Row k="Total (approx.)" v={`~${total.toFixed(4)} SOL`} bold /></div>
          {devBuy > 0 && <p className="pt-1 text-xs text-amber">pump.fun&apos;s own trading fee also applies to the dev buy.</p>}
        </div>
        <div className="space-y-2 rounded-2xl border border-line p-4 text-sm">
          <p className="label">How this works</p>
          <ol className="list-decimal space-y-1 pl-4 text-mute">
            <li>Image + metadata are uploaded to IPFS via pump.fun.</li>
            <li>Your browser creates the new mint key (it never leaves this tab).</li>
            <li>PumpPortal builds an unsigned create transaction; we simulate it.</li>
            <li>You review and sign in your wallet. We verify on-chain, then {character.c.name} goes live.</li>
          </ol>
        </div>
      </div>
      {p && (
        <div className={`rounded-2xl border p-4 text-sm ${p.sim.ok ? "border-mint/40" : "border-glow/50"}`} data-testid="simulation">
          <p className="font-semibold">{p.sim.ok ? "✓ Simulation passed" : "✕ Simulation failed"}</p>
          {!p.sim.ok && <p className="text-glow">{/AccountNotFound|insufficient|InvalidAccountForFee/i.test(p.sim.err ?? "") ? `This wallet can't cover the launch cost (balance ${p.balance.toFixed(4)} SOL).` : p.sim.err}</p>}
          <p className="text-mute">Wallet balance: {p.balance.toFixed(4)} SOL · Mint: <span className="font-mono">{p.mint.publicKey.toBase58()}</span>{p.sim.units ? ` · ${p.sim.units} CU` : ""}</p>
        </div>
      )}
      {sig && <p className="text-sm">Transaction: <a className="font-mono text-amber underline" href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">{sig.slice(0, 16)}…</a></p>}
      {phase === "done" && p && <p className="text-sm text-mint">Launched! <a className="underline" href={`https://pump.fun/coin/${p.mint.publicKey.toBase58()}`} target="_blank" rel="noreferrer">View on pump.fun ↗</a></p>}
      {error && <p className="text-sm text-glow" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" onClick={onBack} disabled={phase !== "idle" && phase !== "ready"}>← Back</button>
        {(phase === "idle" || phase === "preparing" || (phase === "ready" && !p?.sim.ok)) && (
          <button className="btn btn-glow" onClick={prepare} disabled={phase === "preparing"} data-testid="prepare-launch">{phase === "preparing" ? "Preparing…" : p ? "Re-check" : "Prepare & simulate"}</button>
        )}
        {phase !== "idle" && phase !== "preparing" && p?.sim.ok && (
          <button className="btn btn-glow" onClick={launch} disabled={phase !== "ready"} data-testid="sign-launch">
            {phase === "ready" ? "Sign & launch in wallet" : phase === "signing" ? "Waiting for wallet…" : phase === "confirming" ? "Confirming…" : phase === "verifying" ? "Verifying on-chain…" : "Done"}
          </button>
        )}
      </div>
      <p className="text-xs text-mute">GlowPad never sees your private key or seed phrase and never signs or sends transactions for you.</p>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-semibold" : ""}`}>
      <span className="text-mute">{k}</span>
      <span>{v}</span>
    </div>
  );
}
