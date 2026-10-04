"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "./Providers";

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export function WalletButton({ className = "" }: { className?: string }) {
  const { publicKey, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { wallet, signIn, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!mounted || !connected || !publicKey) {
    return (
      <button className={`btn btn-ghost ${className}`} onClick={() => setVisible(true)} disabled={connecting} data-testid="connect-wallet">
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (!wallet) {
    return (
      <button className={`btn btn-ghost ${className}`} onClick={() => signIn()} title="Sign a free message to prove you own this wallet">
        Sign in · {short(publicKey.toBase58())}
      </button>
    );
  }
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button className="btn btn-ghost w-full" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="h-2 w-2 rounded-full bg-mint" aria-hidden /> {short(wallet)}
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-48 overflow-hidden bg-ink-2 p-1 text-sm shadow-2xl">
          <Link href="/dashboard" className="block rounded-lg px-3 py-2 hover:bg-white/5" onClick={() => setOpen(false)}>My influencers</Link>
          <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={() => { navigator.clipboard?.writeText(wallet); setOpen(false); }}>Copy address</button>
          <button className="block w-full rounded-lg px-3 py-2 text-left text-glow hover:bg-white/5" onClick={() => { signOut(); setOpen(false); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
