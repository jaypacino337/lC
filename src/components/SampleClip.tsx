"use client";

import { useEffect, useRef, useState } from "react";
import { avatarDataUri } from "@/lib/art/avatar";
import { SAMPLE_CHARACTERS } from "@/lib/samples";

const BEATS = [
  { scene: "night out", text: "pov: the diner sign is my ring light" },
  { scene: "street walk", text: "walking home like it's a music video" },
  { scene: "stage", text: "open mic. said one sentence. standing ovation (2 people)" },
];

/** Animated sample "clip" built from our own SVG art + a synthesized WebAudio loop. Clearly labelled as a sample. */
export function SampleClip() {
  const c = SAMPLE_CHARACTERS[0];
  const [i, setI] = useState(0);
  const [sound, setSound] = useState(false);
  const audio = useRef<{ ctx: AudioContext; timer: number } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setI((x) => (x + 1) % BEATS.length), 3200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sound) {
      if (audio.current) {
        window.clearInterval(audio.current.timer);
        audio.current.ctx.close();
        audio.current = null;
      }
      return;
    }
    const ctx = new AudioContext();
    const notes = [220, 277.18, 329.63, 415.3, 329.63, 277.18];
    let n = 0;
    const play = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = notes[n++ % notes.length];
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    };
    play();
    const timer = window.setInterval(play, 400);
    audio.current = { ctx, timer };
    return () => {
      window.clearInterval(timer);
      ctx.close();
      audio.current = null;
    };
  }, [sound]);

  const beat = BEATS[i];
  return (
    <figure className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-glow/40 via-amber/20 to-lilac/30 blur-3xl" aria-hidden />
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-line bg-ink-2 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={beat.scene} src={avatarDataUri({ seed: c.seed, palette: c.palette, scene: beat.scene })} alt={`${c.name}, a sample AI character, in a ${beat.scene} scene`} className="absolute inset-0 h-full w-full animate-kenburns object-cover" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-1 p-3">
          {BEATS.map((b, k) => (
            <span key={b.scene} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={k === i ? { animation: "progress 3.2s linear forwards" } : { width: k < i ? "100%" : "0%" }} />
            </span>
          ))}
        </div>
        <div className="absolute left-3 top-6 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarDataUri({ seed: c.seed, palette: c.palette })} alt="" className="h-8 w-8 rounded-full border border-white/40" />
          <span className="text-sm font-bold drop-shadow">${c.symbol} · {c.name}</span>
        </div>
        <span className="chip absolute right-3 top-6 border-white/30 bg-black/40 text-[10px] uppercase tracking-wider">Sample</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-16 pt-16">
          <p className="font-display text-lg font-bold leading-snug">{beat.text}</p>
          <p className="mt-1 text-xs text-white/70">AI-generated character · concept clip</p>
        </div>
        <button onClick={() => setSound((s) => !s)} className="absolute bottom-4 left-4 rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-xs font-semibold backdrop-blur" aria-pressed={sound}>
          {sound ? "🔊 Sound on" : "🔇 Sound off"}
        </button>
      </div>
      <figcaption className="mt-3 text-center text-xs text-mute">See it in action: one character, one sentence, a finished clip. <span className="text-cream">Sample, not a real token.</span></figcaption>
    </figure>
  );
}
