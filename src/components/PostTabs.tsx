"use client";

import { useState } from "react";
import { PostCard, type PostCardData } from "./PostCard";
import { PlatformIcon } from "./PlatformIcon";

const TABS = [
  { k: "all", l: "All" },
  { k: "x", l: "X" },
  { k: "tiktok", l: "TikTok" },
  { k: "instagram", l: "Instagram" },
] as const;

export function PostTabs({ posts, graduated }: { posts: PostCardData[]; graduated: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("all");
  const shown = tab === "all" ? posts : posts.filter((p) => p.platform === tab);
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-2xl font-bold">Posts</h2>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`chip px-3 py-1.5 text-sm ${tab === t.k ? "border-amber text-amber" : ""}`}>
            {t.k !== "all" && <PlatformIcon platform={t.k} size={13} />} {t.l}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p, k) => <PostCard key={k} p={p} />)}
        </div>
      ) : (
        <div className="card p-8 text-center text-mute">
          {tab !== "all" && tab !== "x" && !graduated ? `${tab === "tiktok" ? "TikTok" : "Instagram"} unlocks when the coin graduates.` : "No posts yet. The first ones are on their way."}
        </div>
      )}
    </section>
  );
}
