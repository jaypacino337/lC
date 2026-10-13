"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { BatchView } from "@/app/api/batches/route";
import { site } from "./site";

/** One shared poll of /api/batches for every component on the page. */
type State = { status: "loading" | "live" | "error"; batches: BatchView[]; at: number | null };
let state: State = { status: "loading", batches: [], at: null };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    const res = await fetch("/api/batches", { cache: "no-store" });
    const json = (await res.json()) as { batches: BatchView[]; at: number; error?: string };
    if (!res.ok || json.error) throw new Error(json.error);
    state = { status: "live", batches: json.batches, at: json.at };
  } catch {
    state = { ...state, status: "error" };
  }
  subs.forEach((f) => f());
}

function subscribe(f: () => void) {
  subs.add(f);
  if (!timer) {
    load();
    timer = setInterval(load, site.refreshMs * 1.5);
  }
  return () => {
    subs.delete(f);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const SERVER: State = { status: "loading", batches: [], at: null };

export function useBatches() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  // refetch when the tab comes back
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return s;
}
