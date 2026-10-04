import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/Avatar";
import { GraduationBar } from "@/components/GraduationBar";
import { PlatformBadge, PlatformIcon } from "@/components/PlatformIcon";
import { PostTabs } from "@/components/PostTabs";
import type { PostCardData } from "@/components/PostCard";
import { db } from "@/lib/http";
import { connectedPlatforms, getInfluencerBySlug, postsFor } from "@/lib/services/influencers";
import { timeAgo } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const inf = await getInfluencerBySlug(await db(), (await params).slug);
  return inf ? { title: `${inf.character.name} ($${inf.tokenSymbol})`, description: inf.character.tagline } : {};
}

const SOCIAL_URL: Record<string, (u: string) => string> = {
  x: (u) => `https://x.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
  instagram: (u) => `https://www.instagram.com/${u}`,
};
const SCENES = ["street walk", "face cam", "gym", "road trip", "airport", "stage", "dance", "night out"];

export default async function Profile({ params }: { params: Promise<{ slug: string }> }) {
  const d = await db();
  const inf = await getInfluencerBySlug(d, (await params).slug);
  if (!inf) notFound();
  const [posts, accounts] = await Promise.all([postsFor(d, inf.id, ["posted", "dry_run"], 60), connectedPlatforms(d, [inf.id])]);
  const accts = accounts.get(inf.id) ?? [];
  const c = inf.character;
  const cards: PostCardData[] = posts.map((p) => ({
    name: c.name,
    symbol: inf.tokenSymbol,
    seed: inf.seed,
    palette: c.palette,
    avatarSrc: inf.referenceImageUrl,
    platform: p.platform as PostCardData["platform"],
    caption: p.caption,
    mediaSrc: p.mediaUrl,
    scene: SCENES.find((s) => p.mediaPrompt.toLowerCase().includes(s)),
    when: timeAgo(p.postedAt),
    badge: p.status === "dry_run" ? "Dry run" : undefined,
    externalUrl: p.externalUrl,
  }));
  return (
    <div className="section py-10">
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="card overflow-hidden">
            <Avatar seed={inf.seed} palette={c.palette} src={inf.referenceImageUrl} size={340} className="aspect-square w-full" alt={`${c.name} reference portrait`} />
            <div className="space-y-3 p-5">
              <div>
                <h1 className="font-display text-3xl font-extrabold">{c.name}</h1>
                <p className="text-amber">${inf.tokenSymbol} <span className="text-mute">· @{c.handle}</span></p>
              </div>
              <p className="text-mute">{c.tagline}</p>
              <div className="flex flex-wrap gap-1.5">
                <PlatformBadge platform="x" />
                <PlatformBadge platform="tiktok" locked={!inf.graduated} />
                <PlatformBadge platform="instagram" locked={!inf.graduated} />
              </div>
              <GraduationBar progress={inf.bondingProgress} graduated={inf.graduated} />
              <div className="flex flex-wrap gap-2 pt-1 text-sm">
                <a className="btn btn-ghost px-3 py-1.5 text-xs" href={`https://dexscreener.com/solana/${inf.mint}`} target="_blank" rel="noreferrer">Chart ↗</a>
                {inf.tokenSource === "pump" && <a className="btn btn-ghost px-3 py-1.5 text-xs" href={`https://pump.fun/coin/${inf.mint}`} target="_blank" rel="noreferrer">pump.fun ↗</a>}
                <a className="btn btn-ghost px-3 py-1.5 text-xs" href={`https://solscan.io/token/${inf.mint}`} target="_blank" rel="noreferrer">Solscan ↗</a>
              </div>
              <p className="break-all font-mono text-[11px] text-mute">CA {inf.mint}</p>
            </div>
          </div>
          <div className="card space-y-2 p-5">
            <h2 className="font-display text-lg font-bold">Socials</h2>
            {accts.length ? (
              accts.map((a) => (
                <a key={a.platform} href={a.username ? SOCIAL_URL[a.platform]?.(a.username) : "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:text-amber">
                  <PlatformIcon platform={a.platform as "x"} /> @{a.username ?? "connected"}
                </a>
              ))
            ) : (
              <p className="text-sm text-mute">No accounts connected yet.</p>
            )}
          </div>
        </aside>
        <div className="min-w-0 space-y-6">
          <section className="card grid gap-5 p-6 md:grid-cols-2">
            <Field label="Look" value={c.look} />
            <Field label="Voice" value={c.voice} />
            <Field label="Backstory" value={c.backstory} />
            <Field label="Posting style" value={c.postingStyle} />
            <div>
              <p className="label">Recurring places</p>
              <div className="flex flex-wrap gap-1.5">{c.recurringLocations.map((l) => <span key={l} className="chip">{l}</span>)}</div>
            </div>
            <div>
              <p className="label">Catchphrases</p>
              <div className="flex flex-wrap gap-1.5">{c.catchphrases.map((l) => <span key={l} className="chip">“{l}”</span>)}</div>
            </div>
            <p className="text-xs text-mute md:col-span-2">Fictional AI character. Persona: “{inf.personaPrompt}”. Posts are labelled AI-generated and never discuss price.</p>
          </section>
          <PostTabs posts={cards} graduated={inf.graduated} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}
