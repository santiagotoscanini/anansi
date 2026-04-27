"use client";

import Image from "next/image";
import { isEmojiUrl } from "~/lib/emoji-utils";

// Deterministic pastel-on-dark palette for initial-avatars. Hash the name so
// the same person always gets the same color across renders and sessions.
const INITIAL_COLORS = [
  { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/30" },
  { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/30" },
  { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/30" },
  { bg: "bg-rose-500/20", text: "text-rose-300", border: "border-rose-500/30" },
  { bg: "bg-violet-500/20", text: "text-violet-300", border: "border-violet-500/30" },
  { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/30" },
  { bg: "bg-teal-500/20", text: "text-teal-300", border: "border-teal-500/30" },
  { bg: "bg-pink-500/20", text: "text-pink-300", border: "border-pink-500/30" },
];

function colorForName(name: string): (typeof INITIAL_COLORS)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length]!;
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Take first character of first word; uppercase. Handles emoji-prefixed names.
  const first = [...trimmed][0] ?? "?";
  return first.toLocaleUpperCase();
}

export type AvatarSize = "xs" | "sm" | "md" | "lg";
export type AvatarShape = "square" | "circle";

const SIZE_CLASSES: Record<AvatarSize, { box: string; text: string; emoji: string; img: number }> = {
  xs: { box: "h-5 w-5", text: "text-[10px]", emoji: "text-xs", img: 16 },
  sm: { box: "h-8 w-8", text: "text-sm", emoji: "text-xl", img: 20 },
  md: { box: "h-10 w-10", text: "text-base", emoji: "text-2xl", img: 24 },
  lg: { box: "h-14 w-14", text: "text-xl", emoji: "text-3xl", img: 32 },
};

interface AvatarProps {
  name: string;
  emoji: string | null | undefined;
  size?: AvatarSize;
  shape?: AvatarShape;
  className?: string;
}

export default function Avatar({ name, emoji, size = "md", shape = "square", className = "" }: AvatarProps) {
  const s = SIZE_CLASSES[size];
  const radius = shape === "circle" ? "rounded-full" : "rounded-lg";

  if (emoji) {
    if (isEmojiUrl(emoji)) {
      return (
        <div
          className={`flex ${s.box} ${radius} shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/5 ${className}`}
        >
          {/*
           * unoptimized: the /uploads/[...path] route is auth-gated by the
           * caller's HttpOnly cookie. Next/Image's optimizer makes its own
           * server-side fetch without that cookie, so it always 401s and
           * logs "received null". Optimization adds nothing for tiny
           * per-user avatars anyway — the serving route already sets a
           * private,max-age cache header. Skip the optimizer entirely.
           */}
          <Image src={emoji} alt="" width={s.img} height={s.img} unoptimized className="h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div
        className={`flex ${s.box} ${radius} shrink-0 items-center justify-center border border-white/10 bg-white/5 ${className}`}
      >
        <span className={`${s.emoji} leading-none`}>{emoji}</span>
      </div>
    );
  }

  const color = colorForName(name);
  return (
    <div
      className={`flex ${s.box} ${s.text} ${color.bg} ${color.text} ${color.border} ${radius} shrink-0 items-center justify-center border font-medium ${className}`}
    >
      {initialFor(name)}
    </div>
  );
}
