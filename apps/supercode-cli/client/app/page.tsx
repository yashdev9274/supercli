"use client";

import { useState, useEffect } from "react";
import { PulseButton } from "@/components/ui/pulse-button";
import { cn } from "@/lib/utils";

function MatrixRain() {
  const [chars, setChars] = useState<Array<{ id: number; chars: string[] }>>([]);

  useEffect(() => {
    const columns = Math.floor(typeof window !== "undefined" ? window.innerWidth / 20 : 50);
    const newChars = Array.from({ length: columns }, (_, i) => ({
      id: i,
      chars: Array.from({ length: 20 }, () =>
        String.fromCharCode(0x30a0 + Math.random() * 96)
      ),
    }));
    setChars(newChars);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0∫.03] pointer-events-none">
      {chars.map((col) => (
        <div
          key={col.id}
          className="absolute top-0 animate-[matrix_8s_linear_infinite]"
          style={{
            left: `${col.id * 4}%`,
            animationDuration: `${8 + Math.random() * 4}s`,
            animationDelay: `-${Math.random() * 8}s`,
          }}
        >
          {col.chars.map((char, i) => (
            <span
              key={i}
              className={cn(
                "text-xs font-mono",
                i < 5 ? "text-amber-500" : "text-zinc-500"
              )}
            >
              {char}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function GridPattern() {
  return (
    <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black_40%,transparent_100%)] pointer-events-none" />
  );
}

function Vignette() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative min-h-screen bg-zinc-950 overflow-hidden flex items-center justify-center">
      <MatrixRain />
      <GridPattern />
      <Vignette />

      <div
        className={cn(
          "relative z-10 flex flex-col items-center gap-16 transition-all duration-[1.5s] ease-out",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}
      >
        <div className="text-center space-y-4">
          <div
            className={cn(
              "font-mono text-xs tracking-[0.3em] text-amber-500/60 uppercase transition-all duration-700 delay-200",
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            Terminal v2.0
          </div>
          <h1
            className={cn(
              "text-5xl md:text-7xl font-bold tracking-tighter text-zinc-100 transition-all duration-700 delay-300",
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <span className="text-zinc-500">Super</span>
            <span className="text-amber-500">code</span>
          </h1>
          <p
            className={cn(
              "text-zinc-500 font-mono text-sm max-w-xs mx-auto transition-all duration-700 delay-500",
              showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            AI-powered terminal interface for developers
          </p>
        </div>

        <div
          className={cn(
            "transition-all duration-700 delay-700",
            showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <PulseButton className="scale-110">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Initialize System
          </PulseButton>
        </div>

        <div
          className={cn(
            "flex items-center gap-8 font-mono text-xs text-zinc-600 transition-all duration-700 delay-1000",
            showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Ready
          </span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            Awaiting Input
          </span>
        </div>
      </div>

      <div
        className={cn(
          "absolute bottom-8 left-8 right-8 flex justify-between font-mono text-xs text-zinc-700 transition-all duration-1000 delay-[1200ms]",
          showContent ? "opacity-100" : "opacity-0"
        )}
      >
        <span>session: active</span>
        <span>connection: secure</span>
        <span>v2.0.0</span>
      </div>
    </div>
  );
}
