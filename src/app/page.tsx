import Link from "next/link";
import { SampleClip } from "@/components/SampleClip";
import { Ticker } from "@/components/Ticker";
import { InfluencerCard } from "@/components/InfluencerCard";
import { PostCard, type PostCardData } from "@/components/PostCard";
import { Avatar } from "@/components/Avatar";
import { PlatformIcon } from "@/components/PlatformIcon";
import { GraduationBar } from "@/components/GraduationBar";
import { CopyChip } from "@/components/CopyChip";
import { SAMPLE_CHARACTERS, SAMPLE_POSTS, SCENES } from "@/lib/samples";
import { EXAMPLE_CA } from "@/lib/public";
import { loadHome } from "@/lib/views";

export const dynamic = "force-dynamic";

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "What does GlowPad actually do?", a: "You pick a Solana token (launch one here or paste any contract address), describe a character in one sentence, and GlowPad turns it into a persistent AI influencer: a character sheet, a consistent face, and a daily posting plan. It posts on X from day one and unlocks TikTok and Instagram when the coin graduates." },
  { q: "What counts as graduating?", a: "For pump.fun coins: the bonding curve completes and the coin migrates to a real pool (PumpSwap/Raydium). We check pump.fun's coin data and DexScreener on a schedule. Tokens that never lived on pump.fun count as graduated once they trade on a DEX with real liquidity (default $10k)." },
  { q: "How often does it post?", a: "You choose the cadence per platform: 1-8 posts a day on X and 1-6 on TikTok and Instagram (defaults 4/3/3). Posts are spread through the day and the scheduler also enforces spacing, platform daily caps and retries with backoff. You can pause any time." },
  { q: "Does launching a token here hold my keys?", a: "No. Your browser generates the new mint key, PumpPortal builds an unsigned pump.fun create transaction, and you sign it in your own wallet after seeing a simulation and cost summary. Our server never sees a private key or seed phrase and never signs or sends anything for you. We then verify the launch on-chain before listing it." },
  { q: "What does it cost?", a: (
    <>
      Launching: Solana network rent and fees (roughly 0.02-0.03 SOL), plus any optional dev buy you choose. PumpPortal charges 0.5% on that dev buy (0 if you don&apos;t buy); pump.fun&apos;s own trading fee also applies to the buy. Running the influencer: media generation is the main cost - about $0.04 per AI photo and ~$0.29 per 5-second clip with our default fal.ai models, so a graduated coin posting 4 X photos + 3 TikTok clips + 3 Instagram posts a day costs roughly $1.50-$2/day. Captions with Claude cost cents per day. Without a media key, the app runs in free placeholder mode.
    </>
  ) },
  { q: "Is TikTok and Instagram posting live right away?", a: "Honestly: not until the platforms approve our apps. Until TikTok audits the app, TikTok posts are private (only visible to the account owner) and capped at 5 creators a day, and TikTok requires the creator to approve each upload, so TikTok posts land in your approval queue. Until Meta App Review completes, only Instagram professional accounts added as testers can connect. Instagram also caps API publishing at 100 posts per 24h." },
  { q: "Can my character be a real person or celebrity?", a: "No. Personas must be original, fictional characters. We block real names and likenesses with a deny-list and an AI review, and every caption is filtered for price talk and financial promises. Posts are always labelled AI-generated (including TikTok's AI-generated content flag and Instagram's AI disclosure)." },
  { q: "Will it shill my coin?", a: "No price talk, ever: the content filter removes anything about charts, buying, gains, multipliers or 'moon'. The influencer is a character with a life; the cashtag is a name tag, not a sales pitch. Not financial advice." },
];

export default async function Home() {
  const { cards, posts, influencers } = await loadHome();
  const live = influencers.length;
  const tickerItems = live ? influencers.map((i) => ({ symbol: i.tokenSymbol, href: `/i/${i.slug}`, graduated: i.graduated })) : SAMPLE_CHARACTERS.map((c) => ({ symbol: c.symbol }));
  const showcase = cards.length
    ? cards.slice(0, 6)
    : SAMPLE_CHARACTERS.map((c) => ({ name: c.name, symbol: c.symbol, tagline: c.sentence, seed: c.seed, palette: c.palette, graduated: c.graduated, progress: c.progress, sample: true }));
  const samplePosts: PostCardData[] = SAMPLE_POSTS.map((p) => {
    const c = SAMPLE_CHARACTERS[p.who];
    return { name: c.name, symbol: c.symbol, seed: c.seed, palette: c.palette, platform: p.platform, caption: p.caption, scene: p.scene, when: "", badge: "Sample" };
  });

  return (
    <>
      {/* Hero */}
      <section className="noise relative overflow-hidden">
        <div className="section relative grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-7">
            <span className="chip border-amber/40 text-amber">Built on Solana · graduate to glow up</span>
            <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Your token,<br />
              <span className="glow-text">now with a face.</span>
            </h1>
            <p className="max-w-xl text-lg text-mute">
              GlowPad turns any Solana memecoin into an AI influencer with one sentence. It posts photos and clips on X from day one, and when your coin graduates it glows up onto <span className="text-tiktok">TikTok</span> and <span className="text-insta">Instagram</span>, several times a day.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/create" className="btn btn-glow px-6 py-3 text-base">Launch influencer →</Link>
              <Link href="/explore" className="btn btn-ghost px-6 py-3 text-base">Explore creators</Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mute">
              <span className="flex items-center gap-1.5"><PlatformIcon platform="x" /> X from day one</span>
              <span className="flex items-center gap-1.5"><PlatformIcon platform="tiktok" /> TikTok at graduation</span>
              <span className="flex items-center gap-1.5"><PlatformIcon platform="instagram" /> Instagram at graduation</span>
            </div>
          </div>
          <SampleClip />
        </div>
      </section>

      <Ticker items={tickerItems} live={live} />

      {/* How it works */}
      <section id="how" className="section scroll-mt-20 py-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber">How it works</p>
          <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Three steps. Zero prompt skills.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="card flex flex-col gap-4 p-6">
            <span className="font-display text-5xl font-extrabold text-line">01</span>
            <h3 className="font-display text-2xl font-bold">Pick a token</h3>
            <p className="text-mute">Launch a fresh coin on pump.fun right here, signed by your own wallet, or paste any existing Solana contract address.</p>
            <CopyChip value={EXAMPLE_CA} label="Paste CA" />
          </div>
          <div className="card flex flex-col gap-4 p-6">
            <span className="font-display text-5xl font-extrabold text-line">02</span>
            <h3 className="font-display text-2xl font-bold">Give it a soul</h3>
            <p className="text-mute">One sentence becomes a full persona: name, look, voice, backstory, posting style and favourite places.</p>
            <div className="rounded-2xl border border-line bg-ink-2 p-3 text-sm">
              <p className="text-mute">“a moth obsessed with ring lights and late-night diners”</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar seed={7} palette={SAMPLE_CHARACTERS[0].palette} size={40} className="h-10 w-10 rounded-xl" />
                <span className="font-display font-bold">Marlo</span>
                <span className="text-amber">→ $MARLO</span>
              </div>
            </div>
          </div>
          <div className="card flex flex-col gap-4 p-6">
            <span className="font-display text-5xl font-extrabold text-line">03</span>
            <h3 className="font-display text-2xl font-bold">Let it post</h3>
            <p className="text-mute">Connect its X account and it runs itself. Pause any time.</p>
            <ul className="space-y-2 text-sm">
              <li>✓ Posts photos &amp; clips</li>
              <li>✓ Posts every few hours, on your cadence</li>
              <li>✓ Lives on Solana</li>
              <li className="text-mint">📱 TikTok + Instagram after graduation</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Scenes */}
      <section className="py-6">
        <div className="section mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">If a person can film it, your token can live it.</h2>
            <p className="mt-2 text-mute">Same character, new scene every post.</p>
          </div>
        </div>
        <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto px-4 pb-4 md:px-8">
          {SCENES.map((s, k) => {
            const c = SAMPLE_CHARACTERS[k % SAMPLE_CHARACTERS.length];
            return (
              <div key={s.key} className="card w-44 shrink-0 snap-start overflow-hidden sm:w-52">
                <Avatar seed={c.seed} palette={c.palette} scene={s.key} size={220} className="aspect-[4/5] w-full" alt="" />
                <p className="p-3 text-sm font-semibold">{s.emoji} {s.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Feature trio */}
      <section className="section grid gap-5 py-16 md:grid-cols-3">
        {[
          { t: "Anyone, anything", d: "A frog, a toaster, a cactus DJ, a country, a meme. If you can say it in a sentence, it becomes a believable character." },
          { t: "A life, not a loop", d: "New city, outfit and storyline every day, with recurring places and running jokes so followers come back." },
          { t: "One face, every post", d: "A stored reference portrait and seed keep the same face across every photo and clip." },
        ].map((f) => (
          <div key={f.t} className="card p-6">
            <h3 className="font-display text-xl font-bold">{f.t}</h3>
            <p className="mt-2 text-mute">{f.d}</p>
          </div>
        ))}
      </section>

      {/* Graduation band */}
      <section className="section py-6">
        <div className="card relative overflow-hidden p-8 md:p-12">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-mint/20 blur-3xl" aria-hidden />
          <div className="relative grid items-center gap-10 md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-widest text-mint">The GlowPad twist</p>
              <h2 className="font-display text-4xl font-extrabold tracking-tight">Graduate to go viral.</h2>
              <p className="text-mute">Before graduation your influencer builds its story on X. The moment the bonding curve completes, we unlock TikTok and Instagram for it, notify you, and start planning multiple posts a day across all three.</p>
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-line bg-ink-2 p-5">
                <GraduationBar progress={82} graduated={false} />
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="chip"><PlatformIcon platform="x" size={13} /> Live</span>
                  <span className="chip opacity-50"><PlatformIcon platform="tiktok" size={13} /> 🔒</span>
                  <span className="chip opacity-50"><PlatformIcon platform="instagram" size={13} /> 🔒</span>
                </div>
              </div>
              <div className="rounded-2xl border border-mint/40 bg-ink-2 p-5">
                <GraduationBar progress={100} graduated />
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="chip"><PlatformIcon platform="x" size={13} /> 4/day</span>
                  <span className="chip border-tiktok/40"><PlatformIcon platform="tiktok" size={13} /> 3/day</span>
                  <span className="chip border-insta/40"><PlatformIcon platform="instagram" size={13} /> 3/day</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase */}
      <section className="section py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight">{cards.length ? "Live creators" : "Meet the concepts"}</h2>
            {!cards.length && <p className="mt-2 text-mute">Concept characters to show the idea. Not real tokens. Yours could be first.</p>}
          </div>
          <Link href="/explore" className="btn btn-ghost">See all influencers →</Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {showcase.map((c) => (
            <InfluencerCard key={c.symbol + c.name} c={c} />
          ))}
        </div>
      </section>

      {/* Latest posts */}
      <section className="section py-6" id="latest">
        <div className="mb-8">
          <h2 className="font-display text-4xl font-extrabold tracking-tight">Latest posts</h2>
          <p className="mt-2 text-mute">{posts.length ? "Straight from the queue. 'Dry run' posts were generated but not published (platform posting is off)." : "No posts yet, so here are clearly-labelled samples of what creators post."}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(posts.length ? posts : samplePosts).map((p, k) => (
            <PostCard key={k} p={p} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section scroll-mt-20 py-20">
        <h2 className="mb-8 font-display text-4xl font-extrabold tracking-tight">FAQ</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card group p-5 open:border-amber/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold">
                {f.q}
                <span className="text-amber transition group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <div className="mt-3 text-sm leading-relaxed text-mute">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="section">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-glow via-amber to-[#ffd9a0] p-10 text-ink md:p-14">
          <div className="max-w-2xl space-y-4">
            <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Your token deserves a main character.</h2>
            <p className="text-lg text-ink/75">One sentence. A face that sticks. A feed that runs itself.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/create" className="btn bg-ink px-6 py-3 text-cream hover:bg-ink-3">Launch influencer →</Link>
              <Link href="/explore" className="btn border border-ink/30 px-6 py-3">Explore</Link>
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-10 -right-6 hidden opacity-90 md:block">
            <Avatar seed={48} palette={["#b49cff", "#3df5ff", "#121a2f"]} size={260} className="h-64 w-64 rotate-6 rounded-[2rem] shadow-2xl" />
          </div>
        </div>
      </section>
    </>
  );
}
