"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import bs58 from "bs58";
import "@solana/wallet-adapter-react-ui/styles.css";

interface SessionCtx {
  wallet: string | null;
  loading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<SessionCtx>({ wallet: null, loading: true, signIn: async () => false, signOut: async () => {}, error: null });
export const useSession = () => useContext(Ctx);

function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect } = useWallet();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setWallet(j.wallet ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    if (!publicKey || !signMessage) {
      setError("Connect a wallet that supports message signing.");
      return false;
    }
    try {
      const w = publicKey.toBase58();
      const n = await (await fetch("/api/auth/nonce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w }) })).json();
      if (!n.message) throw new Error(n.error ?? "Could not start sign-in");
      const sig = await signMessage(new TextEncoder().encode(n.message));
      const v = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: w, nonce: n.nonce, signature: bs58.encode(sig) }) });
      const j = await v.json();
      if (!v.ok) throw new Error(j.error ?? "Sign-in failed");
      setWallet(j.wallet);
      return true;
    } catch (e) {
      setError((e as Error).message.includes("reject") ? "Signature request was rejected." : (e as Error).message);
      return false;
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setWallet(null);
    await disconnect().catch(() => {});
  }, [disconnect]);

  // If the user switches wallets in their extension, the old session no longer matches.
  const active = publicKey?.toBase58() ?? null;
  const effective = wallet && active && wallet !== active ? null : wallet;

  return <Ctx.Provider value={{ wallet: effective, loading, signIn, signOut, error }}>{children}</Ctx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}/api/rpc`;
  // Backpack and other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SessionProvider>{children}</SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
