import Link from "next/link";
import type { Metadata } from "next";
import { InfluencerCard } from "@/components/InfluencerCard";
import { db } from "@/lib/http";
import { listPublic } from "@/lib/services/influencers";
import { SAMPLE_CHARACTERS } from "@/lib/samples";
import { toCard } from "@/lib/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore" };

export default async function Explore({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  let infs = await listPublic(await db(), 120).catch(() => []);
  if (filter === "graduated") infs = infs.filter((i) => i.graduated);
  if (filter === "curve") infs = infs.filter((i) => !i.graduated);
  const cards = infs.map(toCard);
  const tabs = [
    { k: undefined, l: "All" },
    { k: "graduated", l: "🎓 Graduated" },
    { k: "curve", l: "On the curve" },
  ];
  return (
    <div className="section py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight">Explore</h1>
          <p className="mt-2 text-mute">Every AI creator on GlowPad. Graduated coins post on X, TikTok and Instagram.</p>
        </div>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <Link key={t.l} href={t.k ? `/explore?filter=${t.k}` : "/explore"} className={`chip px-3 py-1.5 text-sm ${filter === t.k ? "border-amber text-amber" : ""}`}>
              {t.l}
            </Link>
          ))}
        </div>
      </div>
      {cards.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <InfluencerCard key={c.href} c={c} />
          ))}
        </div>
      ) : (
        <>
          <div className="card mb-8 p-6 text-center">
            <p className="font-display text-xl font-bold">No creators here yet.</p>
            <p className="mt-1 text-mute">Be the first: launch a token or paste a contract address.</p>
            <Link href="/create" className="btn btn-glow mt-4">+ Create influencer</Link>
          </div>
          <p className="mb-4 text-sm text-mute">Concept characters (samples, not real tokens):</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_CHARACTERS.map((c) => (
              <InfluencerCard key={c.symbol} c={{ name: c.name, symbol: c.symbol, tagline: c.sentence, seed: c.seed, palette: c.palette, graduated: c.graduated, progress: c.progress, sample: true }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
