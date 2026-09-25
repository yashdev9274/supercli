"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const changelogEntries = [
  { type: "feat" as const, text: "Claude Opus 5 added as a new model — included in high-value models and pricing" },
  { type: "feat" as const, text: "New skills management — commands to add, remove, and list agent skills" },
  { type: "fix" as const, text: "Hallucination guard in agent runner — detects when model claims actions without tool calls" },
  { type: "feat" as const, text: "Usage event migration — new usage_event table for detailed event tracking" },
];

const typeStyles: Record<string, { label: string; color: string }> = {
  feat: { label: "FEAT", color: "text-primary" },
  fix: { label: "FIX", color: "text-green-400" },
};

export default function ChangelogCard() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-[1100px] mx-auto">
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="grid md:grid-cols-[340px_1fr]">
            {/* Left — version info */}
            <div className="flex flex-col justify-center px-6 py-12 md:px-10 border-b md:border-b-0 md:border-r border-border">
              <h2 className="text-lg font-semibold text-primary uppercase mb-3">
                // SHIP
              </h2>
              <h3 className="text-[32px] md:text-[36px] text-[#A1A1AA] font-medium tracking-tighter leading-[1.15] mb-2">
                Changelog
              </h3>
              <span className="text-[42px] md:text-[52px] font-medium text-primary/80 leading-none mb-2">
                v0.1.90
              </span>
              <p className="text-base text-[#A1A1AA] font-medium">
                56 releases shipped
              </p>
            </div>

            {/* Right — recent entries */}
            <div className="flex flex-col justify-center px-6 py-12 md:px-10">
              <div className="flex flex-col gap-6">
                {changelogEntries.map((entry, i) => {
                  const style = typeStyles[entry.type];
                  return (
                    <div key={i} className="flex items-start gap-5">
                      <span
                        className={`shrink-0 w-10 text-sm font-bold tracking-tight ${style.color}`}
                      >
                        {style.label}
                      </span>
                      <p className="text-base text-[#A1A1AA] font-normal">
                        {entry.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Read full changelog link */}
              <div className="mt-10 pt-6 border-t border-border">
                <Link
                  href="/changelog"
                  className="group inline-flex items-center gap-2 text-sm uppercase tracking-tight font-medium text-[#A1A1AA] hover:text-foreground transition-colors"
                >
                  READ FULL CHANGELOG
                  <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
