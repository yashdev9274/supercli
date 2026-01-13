"use client";

import { Lightbulb, User } from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-8">
      <div className="flex items-center gap-2 lg:hidden">
         <div className="h-7 w-7 rounded-none border border-border bg-muted/20 flex items-center justify-center font-bold text-[10px] text-muted-foreground/40">L</div>
         <span className="text-xs font-medium text-foreground/80 tracking-tight">Lamflo</span>
      </div>
      <div className="flex items-center gap-4 ml-auto">
        <button className="flex h-9 w-9 items-center justify-center rounded-none border border-border bg-muted/10 hover:bg-muted/30 transition-all text-muted-foreground/60 hover:text-foreground">
          <Lightbulb className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-none border border-border bg-muted/20 hover:bg-muted/40 transition-all text-muted-foreground/80 hover:text-foreground">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
