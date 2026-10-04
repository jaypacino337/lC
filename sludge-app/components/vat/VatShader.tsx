"use client";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * The liquid inside the vat: Paper Shaders' metaballs (WebGL) in acid green
 * and purple. More ingredients → more blobs. Client-only; without WebGL the
 * CSS slime gradient behind it is what shows.
 */
const Metaballs = dynamic(() => import("@paper-design/shaders-react").then((m) => m.Metaballs), { ssr: false });

export function VatShader({ level }: { level: number }) {
  const reduce = useReducedMotion();
  const [gl, setGl] = useState(false);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setGl(!!(c.getContext("webgl2") || c.getContext("webgl")));
    } catch {
      setGl(false);
    }
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_40%_60%,rgb(184_255_31/0.35),transparent_70%),radial-gradient(50%_45%_at_65%_40%,rgb(180_92_255/0.35),transparent_70%)]" />
      {gl && (
        <Metaballs
          className="absolute inset-0"
          style={{ width: "100%", height: "100%" }}
          colorBack="#00000000"
          colors={["#b8ff1f", "#8cff3a", "#b45cff", "#d8ff6a"]}
          count={8 + level * 3}
          size={0.78}
          speed={reduce ? 0 : 0.7}
          scale={1.05}
        />
      )}
    </div>
  );
}
