"use client";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * The hero's living background: React Bits' LiquidEther (a GPU fluid sim)
 * tinted acid-green → purple, stirred by the cursor and by itself when idle.
 * Loads client-only after first paint; reduced motion (or no WebGL) gets the
 * static slime gradient underneath instead.
 */
const LiquidEther = dynamic(() => import("@/components/LiquidEther"), { ssr: false });

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function SlimeField() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(window.matchMedia("(max-width: 640px)").matches);
    setOn(hasWebGL());
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* static slime: always there, and all that reduced motion gets */}
      <div className="absolute -top-1/4 -left-1/4 size-[70vmax] animate-blob rounded-full bg-brand/14 blur-[110px]" />
      <div className="absolute -right-1/4 -bottom-1/3 size-[60vmax] animate-blob rounded-full bg-accent/18 blur-[120px] [animation-delay:-6s]" />
      {on && !reduce && (
        <LiquidEther
          className="absolute inset-0 opacity-90"
          colors={["#b8ff1f", "#5cff8a", "#b45cff"]}
          mouseForce={22}
          cursorSize={mobile ? 70 : 110}
          resolution={mobile ? 0.3 : 0.45}
          autoDemo
          autoSpeed={0.6}
          autoIntensity={3}
          isViscous={false}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_45%,transparent_30%,var(--color-bg)_100%)]" />
    </div>
  );
}
