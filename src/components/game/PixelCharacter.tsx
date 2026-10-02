"use client";

import type { CSSProperties } from "react";
import { spriteIndex } from "@/lib/game-ui";
import { SPRITE_RECTS } from "@/lib/world";

export default function PixelCharacter({ id, index, className = "", size = 88 }: { id?: string; index?: number; className?: string; size?: number }) {
  const cell = typeof index === "number" ? Math.max(0, Math.min(15, Math.trunc(index))) : spriteIndex(id);
  const [x, y, width, height] = SPRITE_RECTS[cell];
  return <span aria-hidden="true" className={`pixel-character ${className}`} style={{ width: size, height: size, position: "relative", display: "inline-block", flexShrink: 0 } as CSSProperties}>
    <span style={{ position: "absolute", height: "100%", width: `${width / height * 100}%`, left: "50%", transform: "translateX(-50%)", backgroundImage: "url(pixel/characters.png)", backgroundSize: `${1254 / width * 100}% ${1254 / height * 100}%`, backgroundPosition: `${x / (1254 - width) * 100}% ${y / (1254 - height) * 100}%`, backgroundRepeat: "no-repeat", imageRendering: "pixelated" }} />
  </span>;
}
