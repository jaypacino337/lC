"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignInGate } from "@/components/SignInGate";
import { Avatar } from "@/components/Avatar";
import { GraduationBar } from "@/components/GraduationBar";
import { PlatformIcon, PLATFORM_NAME } from "@/components/PlatformIcon";
import { api } from "@/lib/client";
import type { Influencer, Post } from "@/lib/db/schema";

type P = "x" | "tiktok" | "instagram";
interface AccountRow {
  platform: P;
  connected: boolean;
  account: { username: string | null; externalUserId: string; expiresAt: string | null } | null;
  configured: boolean;
  approvalNotice: string | null;
  dryRun: boolean;
  unlocked: boolean;
  creator?: { creator_nickname?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean } | null;
}
interface Data {
  influencer: Influencer;
  accounts: AccountRow[];
  posts: Post[];
  system: { dryRun: boolean; mediaProvider: string; mediaReal: boolean; tiktokAudited: boolean; tiktokApproval: boolean; metaReviewed: boolean };
}

export default function Manage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="section py-10">
      <SignInGate title="Sign in to manage this influencer">
        <Inner id={id} />
      </SignInGate>
    </div>
  );
}

const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

function Inner({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sp = useSearchParams();
  const load = useCallback(() => api<Data>(`/api/influencers/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const c = sp.get("connected");
    const e = sp.get("connect_error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (c) setToast(`${PLATFORM_NAME[c as P] ?? c} connected.`);
    else if (e) setToast(e);
  }, [sp]);

  if (error) return <p className="text-glow">{error}</p>;
  if (!data) return <p className="text-mute">Loading…</p>;
  const { influencer: inf, accounts, posts, system } = data;
  const upcoming = posts.filter((p) => ["queued", "awaiting_approval", "posting"].includes(p.status)).sort((a, b) => +new Date(a.scheduledFor) - +new Date(b.scheduledFor));
  const history = posts.filter((p) => ["posted", "dry_run", "failed", "skipped"].includes(p.status));

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="card flex items-center justify-between border-amber/50 p-4 text-sm" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-mute">✕</button>
        </div>
      )}
      <div className="card flex flex-col gap-5 p-5 md:flex-row md:items-center">
        <Avatar seed={inf.seed} palette={inf.character.palette} src={inf.referenceImageUrl} size={96} className="h-24 w-24 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-extrabold">{inf.character.name}</h1>
            <span className="text-lg text-amber">${inf.tokenSymbol}</span>
            {inf.paused ? <span className="chip text-glow">Paused</span> : <span className="chip text-mint">Active</span>}
          </div>
          <GraduationBar progress={inf.bondingProgress} graduated={inf.graduated} />
          <p className="text-xs text-mute" data-testid="graduation-status">
            {inf.graduated ? `Graduated ${fmt(inf.graduatedAt)} · ` : ""}
            {inf.graduationReason ?? ""} · checked {fmt(inf.graduationCheckedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col">
          <button className={`btn ${inf.paused ? "btn-glow" : "btn-ghost"}`} disabled={!!busy} onClick={() => act("pause", () => api(`/api/influencers/${id}`, { method: "PATCH", json: { paused: !inf.paused } }))} data-testid="pause">
            {inf.paused ? "▶ Resume posting" : "⏸ Pause posting"}
          </button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("plan", () => api(`/api/influencers/${id}/plan`, { method: "POST" }))}>Plan today</button>
          <Link href={`/i/${inf.slug}`} className="btn btn-ghost">Public profile ↗</Link>
        </div>
      </div>

      <div className="space-y-2">
        {system.dryRun && <Banner tone="amber">DRY_RUN is on: posts are generated and the exact API requests are logged, but nothing is published.</Banner>}
        {!system.mediaReal && <Banner tone="mute">Media provider: placeholder (free on-brand art). Set FAL_KEY for real AI photos and clips; TikTok and Instagram need real media.</Banner>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-display text-xl font-bold">Connected accounts</h2>
            <div className="space-y-3">
              {accounts.map((a) => (
                <div key={a.platform} className="rounded-2xl border border-line p-4" data-testid={`account-${a.platform}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <PlatformIcon platform={a.platform} size={20} />
                    <span className="font-semibold">{PLATFORM_NAME[a.platform]}</span>
                    {a.connected ? <span className="chip text-mint">@{a.account?.username ?? a.account?.externalUserId}</span> : <span className="chip">Not connected</span>}
                    {!a.unlocked && <span className="chip">🔒 Unlocks at graduation</span>}
                    <span className="ml-auto flex gap-2">
                      {a.connected ? (
                        <button className="btn btn-ghost px-3 py-1.5 text-xs" disabled={!!busy} onClick={() => act("disc", () => api(`/api/influencers/${id}/accounts/${a.platform}`, { method: "DELETE" }))}>Disconnect</button>
                      ) : a.unlocked ? (
                        a.configured ? (
                          <a className="btn btn-glow px-3 py-1.5 text-xs" href={`/api/connect/${a.platform}/start?influencer=${id}`}>Connect {PLATFORM_NAME[a.platform]}</a>
                        ) : (
                          <span className="chip text-mute" title="The server operator needs to add app credentials">App keys not configured</span>
                        )
                      ) : null}
                    </span>
                  </div>
                  {a.unlocked && a.approvalNotice && <p className="mt-2 text-xs text-amber">⚠ {a.approvalNotice}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5" data-testid="queue">
            <h2 className="mb-1 font-display text-xl font-bold">Queue</h2>
            <p className="mb-4 text-sm text-mute">Upcoming posts for today. {system.tiktokApproval && inf.graduated && "TikTok requires you to approve each upload."}</p>
            {upcoming.length === 0 && <p className="text-sm text-mute">Nothing queued. Use “Plan today”, or wait for the daily planner.</p>}
            <div className="space-y-3">
              {upcoming.map((p) => (
                <QueueItem key={p.id} post={p} tiktok={accounts.find((a) => a.platform === "tiktok")!} audited={system.tiktokAudited} busy={!!busy} onAct={act} />
              ))}
            </div>
          </section>

          <section className="card p-5" data-testid="history">
            <h2 className="mb-4 font-display text-xl font-bold">Post history</h2>
            {history.length === 0 && <p className="text-sm text-mute">No posts yet.</p>}
            <div className="space-y-2">
              {history.map((p) => (
                <details key={p.id} className="rounded-xl border border-line p-3 text-sm">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                    <PlatformIcon platform={p.platform as P} />
                    <StatusChip s={p.status} />
                    <span className="text-xs text-mute">{fmt(p.postedAt ?? p.scheduledFor)}</span>
                    <span className="w-full min-w-0 truncate text-cream/90 sm:w-auto sm:flex-1">{p.caption}</span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {p.lastError && <p className="text-xs text-glow">Last error: {p.lastError}</p>}
                    {p.externalUrl && <a className="text-xs text-amber" href={p.externalUrl} target="_blank" rel="noreferrer">View post ↗</a>}
                    {p.requestPreview ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink p-3 text-[11px] text-mute">{JSON.stringify(p.requestPreview, null, 2)}</pre> : null}
                    {p.status === "failed" && <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => act("retry", () => api(`/api/posts/${p.id}`, { method: "PATCH", json: { action: "retry" } }))}>Retry</button>}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <Cadence inf={inf} onSave={(cadence) => act("cadence", () => api(`/api/influencers/${id}`, { method: "PATCH", json: { cadence } }))} />
          <section className="card space-y-2 p-5 text-sm">
            <h2 className="font-display text-xl font-bold">Persona</h2>
            <p className="text-mute">{inf.character.tagline}</p>
            <p><span className="text-mute">Voice:</span> {inf.character.voice}</p>
            <p><span className="text-mute">Style:</span> {inf.character.postingStyle}</p>
            <p className="text-xs text-mute">Generated by {inf.characterSource === "claude" ? "Claude" : "template"} · CA <span className="break-all font-mono">{inf.mint}</span></p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "amber" | "mute"; children: React.ReactNode }) {
  return <div className={`rounded-xl border px-4 py-2.5 text-sm ${tone === "amber" ? "border-amber/40 bg-amber/5 text-amber" : "border-line text-mute"}`}>{children}</div>;
}

function StatusChip({ s }: { s: string }) {
  const map: Record<string, string> = { posted: "text-mint", dry_run: "text-amber", failed: "text-glow", skipped: "text-mute", queued: "text-cream", awaiting_approval: "text-tiktok", posting: "text-cream" };
  return <span className={`chip ${map[s] ?? ""}`}>{s.replace("_", " ")}</span>;
}

function Cadence({ inf, onSave }: { inf: Influencer; onSave: (c: Record<P, number>) => void }) {
  const [c, setC] = useState<Record<P, number>>(inf.cadence as Record<P, number>);
  const limits: Record<P, [number, number]> = { x: [1, 8], tiktok: [1, 6], instagram: [1, 6] };
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-display text-xl font-bold">Posting cadence</h2>
      {(Object.keys(limits) as P[]).map((p) => (
        <label key={p} className="block">
          <span className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><PlatformIcon platform={p} /> {PLATFORM_NAME[p]}</span>
            <span className="font-semibold">{c[p]}/day</span>
          </span>
          <input type="range" min={limits[p][0]} max={limits[p][1]} value={c[p]} onChange={(e) => setC({ ...c, [p]: Number(e.target.value) })} className="w-full accent-[#ff6a3d]" aria-label={`${PLATFORM_NAME[p]} posts per day`} />
        </label>
      ))}
      <p className="text-xs text-mute">Applies from the next planning run. Platform caps still apply (TikTok ~15/day per creator, Instagram 100/24h).</p>
      <button className="btn btn-glow w-full" onClick={() => onSave(c)}>Save cadence</button>
    </section>
  );
}

function QueueItem({ post, tiktok, audited, busy, onAct }: { post: Post; tiktok: AccountRow; audited: boolean; busy: boolean; onAct: (l: string, f: () => Promise<unknown>) => void }) {
  const [caption, setCaption] = useState(post.caption);
  const [privacy, setPrivacy] = useState("");
  const [allow, setAllow] = useState({ comment: false, duet: false, stitch: false });
  const [consent, setConsent] = useState(false);
  const needsApproval = post.status === "awaiting_approval";
  const options = tiktok.creator?.privacy_level_options ?? ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];
  return (
    <div className={`rounded-2xl border p-4 ${needsApproval ? "border-tiktok/40" : "border-line"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <PlatformIcon platform={post.platform as P} />
        <StatusChip s={post.status} />
        <span className="text-mute">{fmt(post.scheduledFor)}</span>
        <span className="chip">{post.mediaType}</span>
        {post.lastError && <span className="text-xs text-mute">· {post.lastError}</span>}
      </div>
      <textarea className="input min-h-20 text-sm" value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" />
      {needsApproval && (
        <div className="mt-3 space-y-3 rounded-xl bg-ink-2 p-3 text-sm">
          <p>
            Posting to TikTok as <b>{tiktok.creator?.creator_nickname ?? tiktok.account?.username ?? "(connect TikTok)"}</b>
            {!audited && <span className="text-amber"> · app pending TikTok audit: will post as private (Only me)</span>}
          </p>
          <label className="block">
            <span className="label">Who can view this video</span>
            <select className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {options.map((o) => (
                <option key={o} value={o}>{o.replaceAll("_", " ").toLowerCase()}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4">
            {(["comment", "duet", "stitch"] as const).map((k) => {
              const disabled = !!tiktok.creator?.[`${k}_disabled` as "comment_disabled"];
              return (
                <label key={k} className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
                  <input type="checkbox" disabled={disabled} checked={allow[k]} onChange={(e) => setAllow({ ...allow, [k]: e.target.checked })} /> Allow {k}
                </label>
              );
            })}
          </div>
          <label className="flex items-start gap-2 text-xs text-mute">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            I approve uploading this AI-generated post to TikTok. By posting, you agree to TikTok&apos;s Music Usage Confirmation.
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {needsApproval && (
          <button className="btn btn-glow px-4 py-1.5 text-xs" disabled={busy || !privacy || !consent} onClick={() => onAct("approve", () => api(`/api/posts/${post.id}`, { method: "PATCH", json: { action: "approve", caption, tiktok: { privacyLevel: privacy, allowComment: allow.comment, allowDuet: allow.duet, allowStitch: allow.stitch, consent } } }))}>
            Approve for TikTok
          </button>
        )}
        {caption !== post.caption && !needsApproval && (
          <button className="btn btn-ghost px-4 py-1.5 text-xs" disabled={busy} onClick={() => onAct("edit", () => api(`/api/posts/${post.id}`, { method: "PATCH", json: { action: "edit", caption } }))}>Save caption</button>
        )}
        <button className="btn btn-ghost px-4 py-1.5 text-xs" disabled={busy} onClick={() => onAct("skip", () => api(`/api/posts/${post.id}`, { method: "PATCH", json: { action: "skip" } }))}>Skip</button>
      </div>
    </div>
  );
}
