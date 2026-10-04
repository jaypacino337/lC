import "server-only";
import { db } from "./http";
import { latestPosts, listPublic } from "./services/influencers";
import type { InfluencerCardData } from "@/components/InfluencerCard";
import type { PostCardData } from "@/components/PostCard";
import type { Influencer } from "./db/schema";

export function timeAgo(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return "";
  const s = Math.max(1, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function toCard(i: Influencer): InfluencerCardData {
  return {
    name: i.character.name,
    symbol: i.tokenSymbol,
    tagline: i.character.tagline,
    seed: i.seed,
    palette: i.character.palette,
    avatarSrc: i.referenceImageUrl,
    graduated: i.graduated,
    progress: i.bondingProgress,
    href: `/i/${i.slug}`,
  };
}

const SCENES = ["street walk", "face cam", "gym", "road trip", "airport", "stage", "dance", "night out"];

export async function loadHome() {
  try {
    const d = await db();
    const [infs, posts] = await Promise.all([listPublic(d, 24), latestPosts(d, 9)]);
    const postCards: PostCardData[] = posts.map(({ post, inf }) => ({
      name: inf.character.name,
      symbol: inf.symbol,
      seed: inf.seed,
      palette: inf.character.palette,
      avatarSrc: inf.referenceImageUrl,
      platform: post.platform as PostCardData["platform"],
      caption: post.caption,
      mediaSrc: post.mediaUrl,
      scene: SCENES.find((s) => post.mediaPrompt.toLowerCase().includes(s)),
      when: timeAgo(post.postedAt),
      href: `/i/${inf.slug}`,
      badge: post.status === "dry_run" ? "Dry run" : undefined,
      externalUrl: post.externalUrl,
    }));
    return { influencers: infs, cards: infs.map(toCard), posts: postCards };
  } catch (e) {
    console.error("[glowpad] home data failed", e);
    return { influencers: [], cards: [], posts: [] };
  }
}
