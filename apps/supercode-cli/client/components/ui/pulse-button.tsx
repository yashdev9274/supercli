import { useState } from "react";
import { cn } from "@/lib/utils";

interface PulseButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function PulseButton({ className, children }: PulseButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  };

  return (
    <div className={cn("relative group", className)}>
      <div className="absolute inset-0 bg-amber-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-amber-500/5" />
      
      <button
        onClick={handleClick}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        className={cn(
          "relative px-8 py-4 bg-zinc-950 border border-zinc-800 overflow-hidden",
          "transition-all duration-150 ease-out",
          "hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]",
          "active:scale-[0.98] active:border-amber-500/30",
          "focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:ring-offset-2 focus:ring-offset-zinc-950",
          "before:absolute before:inset-0 before:bg-gradient-to-b before:from-zinc-800/30 before:to-transparent",
          "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-amber-500/50 after:to-transparent"
        )}
      >
        <span className="relative z-10 flex items-center gap-3 text-zinc-400 font-mono text-sm tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {children || "Initialize"}
        </span>

        <div className="absolute inset-0 grid grid-cols-[repeat(20,1fr)] grid-rows-[repeat(4,1fr)] opacity-[0.03] pointer-events-none">
          {Array.from({ length: 80 }).map((_, i) => (
            <div key={i} className="border-[0.5px] border-amber-500" />
          ))}
        </div>

        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute bg-amber-500/30 rounded-full animate-ripple pointer-events-none"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 1,
              height: 1,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}

        <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-amber-500/30" />
        <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-amber-500/30" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-amber-500/30" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-amber-500/30" />
      </button>

      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-zinc-600 font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        CLICK TO ACTIVATE
      </div>
    </div>
  );
}
