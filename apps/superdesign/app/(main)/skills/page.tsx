"use client"

import { useState } from "react"
import { listSkills } from "@super/design-core"
import { SkillCard } from "@/components/skill-card"
import { Button } from "@/components/ui/button"

const skills = listSkills()

export default function SkillsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = skills.find((s) => s.id === selectedId)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 animate-[fadeSlideUp_0.3s_ease-out]">
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Skills define what kind of design to generate and how it should be structured.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {skills.map((skill, i) => (
          <div
            key={skill.id}
            className="animate-[fadeSlideUp_0.3s_ease-out]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <SkillCard
              skill={skill}
              selected={selectedId === skill.id}
              onSelect={() => setSelectedId(selectedId === skill.id ? null : skill.id)}
            />
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="mt-8 p-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] animate-[fadeSlideUp_0.3s_ease-out]"
        >
          <h2 className="font-medium mb-2">{selected.name} — Instructions</h2>
          <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap font-sans leading-relaxed">
            {selected.instructions}
          </pre>
        </div>
      )}
    </div>
  )
}
