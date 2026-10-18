"use client";

/* eslint-disable @next/next/no-img-element -- small CDN thumbnails with an initials fallback */
import clsx from "clsx";
import { useState } from "react";

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ src, name, size = 28, className }: { src: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span style={style} className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-2", className)} aria-hidden>
        {initials(name)}
      </span>
    );
  }
  return <img src={src} alt="" style={style} loading="lazy" onError={() => setFailed(true)} className={clsx("shrink-0 rounded-full bg-surface-3 object-cover", className)} />;
}

/** Sleeper's public headshot CDN; falls back to initials when an image is missing. */
export function PlayerAvatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const src = /^\d+$/.test(id) ? `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg` : null;
  return <Avatar src={src} name={name} size={size} />;
}
