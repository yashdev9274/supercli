"use client"

import { useState } from "react"
import { listDesignSystems } from "@super/design-core"
import { DesignSystemCard } from "@/components/design-system-card"

const designSystems = listDesignSystems()

export default function DesignSystemsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = designSystems.find((ds) => ds.id === selectedId)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 animate-[fadeSlideUp_0.3s_ease-out]">
        <h1 className="text-2xl font-semibold tracking-tight">Design Systems</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Design systems provide brand tokens — colors, typography, spacing, and voice.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {designSystems.map((ds, i) => (
          <div
            key={ds.id}
            className="animate-[fadeSlideUp_0.3s_ease-out]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <DesignSystemCard
              system={ds}
              selected={selectedId === ds.id}
              onSelect={() => setSelectedId(selectedId === ds.id ? null : ds.id)}
            />
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="mt-8 p-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] animate-[fadeSlideUp_0.3s_ease-out]"
        >
          <h2 className="font-medium mb-3">{selected.name} — Tokens</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Colors
              </h3>
              <div className="space-y-1.5">
                {selected.colors.map((c) => (
                  <div key={c.hex} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-4 h-4 rounded border border-[var(--border)] shrink-0 transition-transform duration-[var(--dur-quick)] hover:scale-125"
                      style={{ background: c.hex }}
                    />
                    <code className="text-[var(--muted-foreground)]">{c.hex}</code>
                    <span className="text-[var(--muted-foreground)]">— {c.usage}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
                Typography
              </h3>
              <p className="text-xs text-[var(--muted-foreground)] mb-2">{selected.typography.family}</p>
              <div className="space-y-1">
                {Object.entries(selected.typography.scale).map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-[var(--muted-foreground)] w-8">{key}</span>
                    <code className="text-[var(--foreground)]">{val}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
