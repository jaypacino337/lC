"use client";

import { useState } from "react";

export function CopyChip({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip w-fit cursor-pointer font-mono hover:border-amber/60"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      title="Copy example contract address"
    >
      <span className="font-sans text-mute">{label} ·</span> {value.slice(0, 4)}…{value.slice(-4)} {done ? "✓" : "⧉"}
    </button>
  );
}
