"use client";
import { useEffect, useRef } from "react";

/** Lightweight drifting particles on a canvas. Pauses when off-screen; static under reduced motion. */
export function Particles({ count = 70, color = "255,255,255", className }: { count?: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, visible = true;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const pts = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.0004, vy: -Math.random() * 0.0006 - 0.0001, a: Math.random() * 0.6 + 0.2 }));
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduce) {
          p.x += p.vx; p.y += p.vy;
          if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
          if (p.x < 0 || p.x > 1) p.vx *= -1;
        }
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color},${p.a})`;
        ctx.fill();
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    resize();
    io.observe(canvas);
    addEventListener("resize", resize);
    draw();
    return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener("resize", resize); };
  }, [count, color]);
  return <canvas ref={ref} aria-hidden className={className ?? "pointer-events-none absolute inset-0 h-full w-full"} />;
}
