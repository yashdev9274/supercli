"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const SupercardScene = dynamic(() => import("./supercard-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/30">
        initialising card...
      </div>
    </div>
  ),
});

const CATEGORY_LABELS = [
  "inference",
  "web search",
  "stt",
  "tts",
  "browser",
  "compute",
  "embedding",
  "vector db",
];

export default function SupercardStage() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="relative mx-auto flex w-full max-w-[820px] flex-col items-center"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      tabIndex={0}
    >
      <div
        className={cn(
          "relative aspect-[6/5] w-full transition-[transform] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
          expanded ? "scale-[1.02]" : "scale-100"
        )}
      >
        {/* Decorative glow under the card */}
        <div
          className={cn(
            "pointer-events-none absolute -inset-x-12 bottom-6 -z-10 h-40 rounded-[50%] bg-[radial-gradient(closest-side,rgba(120,140,255,0.22),rgba(120,140,255,0))] blur-2xl transition-opacity duration-700",
            expanded ? "opacity-100" : "opacity-60"
          )}
        />
        <SupercardScene expanded={expanded} />
      </div>

      {/* Category chips visible on expand (DOM mirror) */}
      <div
        className={cn(
          "mt-6 flex flex-wrap items-center justify-center gap-2 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
          expanded
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        )}
      >
        {CATEGORY_LABELS.map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white/62"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
