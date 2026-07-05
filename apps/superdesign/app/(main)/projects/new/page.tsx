"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { listSkills, listDesignSystems, FRAMEWORKS } from "@super/design-core"
import type { DesignSkill, DesignSystem, Framework } from "@super/design-core"
import type { FrameworkConfig } from "@super/design-core"
import { SkillCard } from "@/components/skill-card"
import { DesignSystemCard } from "@/components/design-system-card"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Globe,
  Blocks,
  Atom,
  Box,
  Code2,
  Component,
} from "lucide-react"

const skills = listSkills()
const designSystems = listDesignSystems()

const FRAMEWORK_ICONS: Record<Framework, typeof Globe> = {
  html: Globe,
  nextjs: Blocks,
  react: Atom,
  nuxt: Box,
  vue: Code2,
  svelte: Component,
}

export default function NewProjectPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [selectedFramework, setSelectedFramework] = useState<FrameworkConfig | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<DesignSkill | null>(null)
  const [selectedSystem, setSelectedSystem] = useState<DesignSystem | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<"details" | "framework" | "skill" | "system">("details")

  const handleCreate = async () => {
    if (!title.trim()) return
    setLoading(true)

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        framework: selectedFramework?.id ?? "html",
        skillId: selectedSkill?.id ?? null,
        designSystemId: selectedSystem?.id ?? null,
      }),
    })

    if (res.ok) {
      const project = await res.json()
      router.push(`/projects/${project.id}`)
    }
    setLoading(false)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-8 animate-[fadeSlideUp_0.3s_ease-out]">
        New Project
      </h1>

      <div className="space-y-8">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm animate-[fadeSlideUp_0.3s_ease-out]">
          {["Details", "Framework", "Skill", "Design System"].map(
            (label, i) => {
              const active =
                (step === "details" && i === 0) ||
                (step === "framework" && i === 1) ||
                (step === "skill" && i === 2) ||
                (step === "system" && i === 3)
              const done =
                (i === 0 && title.trim()) ||
                (i === 1 && selectedFramework) ||
                (i === 2 && selectedSkill) ||
                (i === 3 && selectedSystem)
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-[var(--dur-enter)] ${
                    done
                      ? "bg-[var(--primary)] text-white scale-100"
                      : active
                        ? "bg-[var(--primary-muted)] text-[var(--primary)] scale-105"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] scale-100"
                  }`}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={
                    active ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
                  }
                >
                  {label}
                </span>
                {i < 3 && <span className="text-[var(--border)] mx-1">—</span>}
              </div>
            )
          })}
        </div>

        {step === "details" && (
          <div className="space-y-4 animate-[fadeSlideUp_0.25s_ease-out]">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Design Project"
                className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-sm outline-none focus:border-[var(--primary)] transition-[border-color,box-shadow] duration-[var(--dur-quick)] focus:shadow-[0_0_0_1px_var(--primary-muted)]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about?"
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-sm outline-none focus:border-[var(--primary)] transition-[border-color,box-shadow] duration-[var(--dur-quick)] focus:shadow-[0_0_0_1px_var(--primary-muted)] resize-none"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => setStep("framework")}
                disabled={!title.trim()}
              >
                Next — Choose Framework
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === "framework" && (
          <div className="animate-[fadeSlideUp_0.25s_ease-out]">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              What framework should the output use?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FRAMEWORKS.map((fw) => {
                const Icon = FRAMEWORK_ICONS[fw.id]
                return (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw)}
                    className={`text-left p-4 rounded-[var(--radius)] border text-sm transition-all duration-[var(--dur-quick)] ease-[var(--ease-out)] active:scale-[0.98] ${
                      selectedFramework?.id === fw.id
                        ? "border-[var(--primary)] bg-[var(--primary-muted)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-light)] hover:shadow-sm"
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-2 text-[var(--muted-foreground)]" />
                    <div className="font-medium">{fw.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mt-1">
                      .{fw.extension}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep("details")}>
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("skill")}
                disabled={!selectedFramework}
              >
                Next — Choose Skill
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === "skill" && (
          <div className="animate-[fadeSlideUp_0.25s_ease-out]">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Pick what kind of design you want to create:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  selected={selectedSkill?.id === skill.id}
                  onSelect={() => setSelectedSkill(skill)}
                />
              ))}
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep("framework")}>
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep("system")}
              >
                Next — Pick Design System
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === "system" && (
          <div className="animate-[fadeSlideUp_0.25s_ease-out]">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Choose a design system for brand tokens:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {designSystems.map((ds) => (
                <DesignSystemCard
                  key={ds.id}
                  system={ds}
                  selected={selectedSystem?.id === ds.id}
                  onSelect={() => setSelectedSystem(ds)}
                />
              ))}
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep("skill")}>
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={loading || !title.trim()}
              >
                {loading ? "Creating..." : "Create Project"}
                <Sparkles className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
