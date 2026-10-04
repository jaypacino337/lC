"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInGate } from "@/components/SignInGate";
import { useSession } from "@/components/Providers";
import { Avatar } from "@/components/Avatar";
import { GraduationBar } from "@/components/GraduationBar";
import { PlatformBadge } from "@/components/PlatformIcon";
import { api } from "@/lib/client";
import type { Influencer } from "@/lib/db/schema";

type Row = Influencer & { accounts: { platform: string; username: string | null }[] };
type Note = { id: string; title: string; body: string; kind: string; readAt: string | null; createdAt: string; influencerId: string | null };

export default function Dashboard() {
  return (
    <div className="section py-12">
      <h1 className="mb-8 font-display text-5xl font-extrabold tracking-tight">My influencers</h1>
      <SignInGate title="Sign in to see your influencers">
        <List />
      </SignInGate>
    </div>
  );
}

function List() {
  const { wallet } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ influencers: Row[] }>("/api/influencers").then((r) => setRows(r.influencers)).catch((e) => setError(e.message));
    api<{ notifications: Note[] }>("/api/notifications").then((r) => setNotes(r.notifications)).catch(() => {});
  }, [wallet]);
  if (error) return <p className="text-glow">{error}</p>;
  if (!rows) return <p className="text-mute">Loading…</p>;
  const unread = notes.filter((n) => !n.readAt);
  return (
    <div className="space-y-8">
      {unread.length > 0 && (
        <div className="card space-y-3 border-amber/40 p-5" data-testid="notifications">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">🔔 Notifications</h2>
            <button className="text-xs text-mute hover:text-cream" onClick={() => api("/api/notifications", { method: "POST" }).then(() => setNotes((n) => n.map((x) => ({ ...x, readAt: new Date().toISOString() }))))}>Mark all read</button>
          </div>
          {unread.slice(0, 6).map((n) => (
            <div key={n.id} className={`rounded-xl border p-3 text-sm ${n.kind === "graduation" ? "border-mint/50 bg-mint/5" : "border-line"}`}>
              <p className="font-semibold">{n.title}</p>
              <p className="text-mute">{n.body}</p>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display text-xl font-bold">No influencers yet</p>
          <p className="mt-1 text-mute">Launch a token or paste a contract address to create your first one.</p>
          <Link href="/create" className="btn btn-glow mt-5">+ Create influencer</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((i) => (
            <Link key={i.id} href={`/dashboard/${i.id}`} className="card flex gap-4 p-4 transition hover:border-amber/50">
              <Avatar seed={i.seed} palette={i.character.palette} src={i.referenceImageUrl} size={88} className="h-22 w-22 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="truncate font-display text-lg font-bold">{i.character.name}</p>
                  <span className="text-amber">${i.tokenSymbol}</span>
                  {i.paused && <span className="chip text-glow">Paused</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["x", "tiktok", "instagram"] as const).map((p) => (
                    <PlatformBadge key={p} platform={p} locked={p !== "x" && !i.graduated} label={i.accounts.find((a) => a.platform === p) ? "✓" : undefined} />
                  ))}
                </div>
                <GraduationBar progress={i.bondingProgress} graduated={i.graduated} compact />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
