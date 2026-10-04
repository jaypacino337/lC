"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "./Providers";

export function SignInGate({ children, title = "Connect your wallet" }: { children: React.ReactNode; title?: string }) {
  const { wallet, loading, signIn, error } = useSession();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  if (loading) return <div className="card p-10 text-center text-mute">Loading…</div>;
  if (wallet) return <>{children}</>;
  return (
    <div className="card mx-auto max-w-lg space-y-4 p-8 text-center">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      <p className="text-mute">Connect Phantom, Solflare or Backpack, then sign a short message to prove the wallet is yours. Signing a message is free and can&apos;t move funds.</p>
      {connected ? (
        <button className="btn btn-glow" onClick={() => signIn()} data-testid="sign-in">Sign message to continue</button>
      ) : (
        <button className="btn btn-glow" onClick={() => setVisible(true)}>Connect wallet</button>
      )}
      {error && <p className="text-sm text-glow">{error}</p>}
    </div>
  );
}
