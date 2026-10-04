import Link from "next/link";
import { Logo } from "./Logo";
import { X_URL } from "@/lib/public";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="section flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="text-sm text-mute">AI influencers for Solana memecoins. Characters are fictional and every post is labelled AI-generated. Nothing here is financial advice.</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-mute">
          <Link href="/explore" className="hover:text-cream">Explore</Link>
          <Link href="/create" className="hover:text-cream">Create influencer</Link>
          <Link href="/dashboard" className="hover:text-cream">My influencers</Link>
          <Link href="/#how" className="hover:text-cream">How it works</Link>
          <Link href="/#faq" className="hover:text-cream">FAQ</Link>
          <a href={X_URL} target="_blank" rel="noreferrer" className="hover:text-cream">Follow on X ↗</a>
        </nav>
      </div>
      <p className="section pb-8 text-xs text-mute/70">Tokens are created on pump.fun by your own wallet. GlowPad never holds keys or signs on your behalf.</p>
    </footer>
  );
}
