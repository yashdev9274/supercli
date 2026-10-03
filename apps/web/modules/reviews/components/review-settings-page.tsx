"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  FileText,
  GitBranch,
  GitPullRequest,
  ListChecks,
  Loader2,
  Plus,
  Settings2,
  Workflow,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import {
  DEFAULT_REVIEW_SETTINGS,
  type ReviewSettings,
} from "../review-settings"
import {
  getReviewSettingsRepositories,
  saveReviewSettings,
} from "../settings-actions"
import { SummaryPreview } from "./summary-preview"

const SECTIONS = [
  { id: "summaries", label: "PR summaries" },
  { id: "instructions", label: "Instructions" },
  { id: "comments", label: "Comments" },
  { id: "automation", label: "Automation" },
]

const SUMMARY_SECTIONS = [
  {
    key: "includeSummary",
    title: "PR Summary",
    description: "A clear overview and walkthrough of the changes.",
    icon: FileText,
    collapsible: "summaryCollapsible",
    defaultOpen: "summaryDefaultOpen",
  },
  {
    key: "includeConfidence",
    title: "Confidence Score",
    description: "A 1–5 confidence rating with a short explanation.",
    icon: BarChart3,
  },
  {
    key: "includeFindings",
    title: "Findings",
    description: "Actionable issues found during the review.",
    icon: ListChecks,
  },
  {
    key: "includeSequenceDiagram",
    title: "Sequence Diagram",
    description: "A Mermaid diagram explaining the changed flow.",
    icon: Workflow,
    collapsible: "diagramCollapsible",
    defaultOpen: "diagramDefaultOpen",
  },
] as const

function SectionHeading({
  id,
  number,
  title,
  description,
}: {
  id: string
  number: string
  title: string
  description: string
}) {
  return (
    <div id={id} className="mb-5 flex scroll-mt-28 items-start gap-3">
      <span className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
        {number}
      </span>
      <div>
        <h2 className="text-base font-medium tracking-tight">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function SettingRow({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-5 px-5 py-5">
      <div className="max-w-lg">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {title}
        </label>
        <p
          id={`${id}-description`}
          className="mt-1 text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-description`}
        className="data-[state=checked]:bg-foreground [&_[data-slot=switch-thumb]]:data-[state=checked]:bg-background"
      />
    </div>
  )
}

type EditorProps = {
  initialSettings: ReviewSettings
  repositoryName?: string
  canSave: boolean
  onDirtyChange?: (dirty: boolean) => void
  onSave: (
    settings: ReviewSettings,
  ) => Promise<{ success: boolean; settings?: ReviewSettings; error?: string }>
}

export function ReviewSettingsEditor({
  initialSettings,
  repositoryName,
  canSave,
  onDirtyChange,
  onSave,
}: EditorProps) {
  const [settings, setSettings] = useState(initialSettings)
  const [savedSettings, setSavedSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [author, setAuthor] = useState("")
  const [authorError, setAuthorError] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [dirty])

  function update<K extends keyof ReviewSettings>(
    key: K,
    value: ReviewSettings[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaveError(null)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await onSave(settings)
      if (!result.success) {
        setSaveError(result.error ?? "Settings could not be saved.")
        return
      }
      setSavedSettings(result.settings ?? settings)
      toast.success("Review settings saved")
    } catch {
      setSaveError(
        "Settings could not be saved. Your changes are still here; try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  function addAuthor() {
    const value = author.trim().replace(/^@/, "")
    if (!value || value.length > 100 || /\s/.test(value)) {
      setAuthorError("Enter a GitHub username, such as dependabot[bot].")
      return
    }
    if (
      settings.excludedAuthors.some(
        (entry) => entry.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setAuthorError("This author is already excluded.")
      return
    }
    if (settings.excludedAuthors.length >= 50) {
      setAuthorError("You can exclude up to 50 authors.")
      return
    }
    update("excludedAuthors", [...settings.excludedAuthors, value])
    setAuthor("")
    setAuthorError(null)
  }

  return (
    <>
      <div className="sticky top-0 z-20 -mx-5 mb-8 flex flex-wrap items-center justify-between gap-3 border-y border-border bg-background/95 px-5 py-3 backdrop-blur-sm md:-mx-8 md:px-8">
        <nav
          aria-label="Review settings sections"
          className="flex flex-wrap gap-1"
        >
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span role="status" className="text-[10px] text-muted-foreground">
            {saving ? (
              "Saving…"
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              <span className="flex items-center gap-1.5">
                <Check className="size-3" />{" "}
                {canSave ? "All changes saved" : "Preview mode"}
              </span>
            )}
          </span>
          <Button
            disabled={!canSave || !dirty || saving}
            title={
              !canSave
                ? "Select a connected repository before saving"
                : !dirty
                  ? "Change a setting to enable saving"
                  : "Save settings for the selected repository"
            }
            onClick={save}
            size="sm"
            className="h-8 bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}Save
            changes
          </Button>
        </div>
      </div>
      {saveError ? (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4 text-xs"
        >
          <p>{saveError}</p>
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            Retry save
          </Button>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <fieldset
          disabled={saving}
          className="min-w-0 space-y-10 disabled:opacity-70"
        >
          <section aria-labelledby="summaries">
            <SectionHeading
              id="summaries"
              number="01"
              title="PR summaries"
              description="Decide what Supercode posts at the top of your pull requests."
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card/40">
              <SettingRow
                id="update-description"
                title="Update pull request description"
                description="Add a generated changelog to the PR description, without replacing the author’s original text."
                checked={settings.updateDescription}
                onChange={(value) => update("updateDescription", value)}
              />
              <div className="border-t border-border">
                <SettingRow
                  id="image-badges"
                  title="Visual badges"
                  description="Use emoji badges and reaction labels. Turn off for a text-only review."
                  checked={settings.imageBadges}
                  onChange={(value) => update("imageBadges", value)}
                />
              </div>
              <div className="border-t border-border p-5">
                <h3 className="text-sm font-medium">
                  What’s included in your summary
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the sections that appear in the review comment.
                </p>
                <div className="mt-5 space-y-2">
                  {SUMMARY_SECTIONS.map((section) => {
                    const Icon = section.icon
                    const enabled = settings[section.key]
                    const collapsible =
                      "collapsible" in section ? section.collapsible : null
                    const defaultOpen =
                      "defaultOpen" in section ? section.defaultOpen : null
                    return (
                      <div
                        key={section.key}
                        className={cn(
                          "rounded-lg border border-border bg-background/30 p-3.5",
                          !enabled && "bg-muted/10",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={section.key}
                              className="cursor-pointer text-xs font-medium"
                            >
                              {section.title}
                            </label>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                              {section.description}
                            </p>
                          </div>
                          <Switch
                            id={section.key}
                            checked={enabled}
                            onCheckedChange={(value) =>
                              update(section.key, value)
                            }
                            aria-label={`Include ${section.title}`}
                            className="data-[state=checked]:bg-foreground [&_[data-slot=switch-thumb]]:data-[state=checked]:bg-background"
                          />
                        </div>
                        {collapsible && defaultOpen ? (
                          <div className="mt-3 flex flex-wrap gap-5 pl-7">
                            <label
                              className={cn(
                                "flex items-center gap-2 text-[10px] text-muted-foreground",
                                !enabled && "opacity-50",
                              )}
                            >
                              <Checkbox
                                checked={settings[collapsible]}
                                disabled={!enabled}
                                onCheckedChange={(value) =>
                                  update(collapsible, value === true)
                                }
                                aria-label={`${section.title} collapsible`}
                              />
                              Collapsible
                            </label>
                            <label
                              className={cn(
                                "flex items-center gap-2 text-[10px] text-muted-foreground",
                                (!enabled || !settings[collapsible]) &&
                                  "opacity-50",
                              )}
                            >
                              <Checkbox
                                checked={settings[defaultOpen]}
                                disabled={!enabled || !settings[collapsible]}
                                onCheckedChange={(value) =>
                                  update(defaultOpen, value === true)
                                }
                                aria-label={`${section.title} default open`}
                              />
                              Default open
                            </label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
                  Hiding findings here doesn’t disable inline review comments.
                </p>
              </div>
            </div>
          </section>
          <section aria-labelledby="instructions">
            <SectionHeading
              id="instructions"
              number="02"
              title="Custom instructions"
              description="Give Supercode the context that matters to your team."
            />
            <div className="rounded-xl border border-border bg-card/40 p-5">
              <label
                htmlFor="review-instructions"
                className="text-sm font-medium"
              >
                Review instructions
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Tell the reviewer about conventions, sensitive code paths, or
                things to prioritize.
              </p>
              <Textarea
                id="review-instructions"
                value={settings.instructions}
                onChange={(event) => update("instructions", event.target.value)}
                maxLength={8000}
                placeholder="e.g. Prioritize authorization and data integrity. Flag breaking API changes. Follow the repository’s existing conventions."
                className="mt-4 min-h-36 resize-y bg-background/40 text-xs leading-relaxed md:text-xs"
              />
              <p className="mt-2 text-right font-mono text-[9px] text-muted-foreground">
                {settings.instructions.length.toLocaleString()} / 8,000
              </p>
            </div>
          </section>
          <section aria-labelledby="comments">
            <SectionHeading
              id="comments"
              number="03"
              title="Review comments"
              description="Keep the signal high and make every comment feel like your team."
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card/40">
              <div className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p id="strictness-label" className="text-sm font-medium">
                      Strictness level
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose the minimum severity to comment on.
                    </p>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={settings.strictness}
                    onValueChange={(value) => {
                      if (value)
                        update(
                          "strictness",
                          value as ReviewSettings["strictness"],
                        )
                    }}
                    aria-labelledby="strictness-label"
                    className="shrink-0 border border-border bg-muted/30 p-1"
                    spacing={1}
                  >
                    {["low", "medium", "high"].map((value) => (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        className="h-7 rounded-md px-3 text-[11px] capitalize data-[state=on]:bg-background data-[state=on]:text-foreground"
                      >
                        {value}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <p className="mt-4 inline-block rounded-md border border-border bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                  {settings.strictness === "low"
                    ? "Comment on all actionable issues."
                    : settings.strictness === "medium"
                      ? "Comment on medium, high, and critical issues."
                      : "Comment on high and critical issues only."}
                </p>
              </div>
              <div className="border-t border-border p-5">
                <label htmlFor="comment-header" className="text-sm font-medium">
                  Comment header
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Markdown added to the top of every review and inline comment.
                </p>
                <Textarea
                  id="comment-header"
                  value={settings.commentHeader}
                  onChange={(event) =>
                    update("commentHeader", event.target.value)
                  }
                  maxLength={2000}
                  placeholder="e.g. **Team review:** Please verify suggestions before applying them."
                  className="mt-4 min-h-24 resize-y bg-background/40 font-mono text-xs md:text-xs"
                />
                <p className="mt-2 text-right font-mono text-[9px] text-muted-foreground">
                  {settings.commentHeader.length.toLocaleString()} / 2,000
                </p>
              </div>
            </div>
          </section>
          <section aria-labelledby="automation">
            <SectionHeading
              id="automation"
              number="04"
              title="Automatic reviews"
              description="Control when Supercode joins the conversation."
            />
            <div className="overflow-hidden rounded-xl border border-border bg-card/40">
              <div className="p-5">
                <p id="automatic-reviews-label" className="text-sm font-medium">
                  Review triggers
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manual reviews are always available, regardless of this
                  setting.
                </p>
                <ToggleGroup
                  type="single"
                  value={settings.automaticReviews}
                  onValueChange={(value) => {
                    if (value)
                      update(
                        "automaticReviews",
                        value as ReviewSettings["automaticReviews"],
                      )
                  }}
                  aria-labelledby="automatic-reviews-label"
                  className="mt-4 flex w-full flex-wrap border border-border bg-muted/30 p-1"
                  spacing={1}
                >
                  {[
                    { value: "never", label: "Never" },
                    { value: "opened", label: "On PR opened" },
                    { value: "pushes", label: "On new pushes" },
                    { value: "all", label: "All review events" },
                  ].map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className="h-8 flex-1 rounded-md px-2 text-[11px] data-[state=on]:bg-background data-[state=on]:text-foreground"
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  “On PR opened” includes reopened and ready-for-review events.
                  “All review events” also includes new pushes.
                </p>
              </div>
              <div className="border-t border-border">
                <SettingRow
                  id="review-drafts"
                  title="Review draft pull requests"
                  description="Include drafts when an automatic review event occurs."
                  checked={settings.reviewDrafts}
                  onChange={(value) => update("reviewDrafts", value)}
                />
              </div>
              <div className="border-t border-border p-5">
                <label
                  htmlFor="excluded-author"
                  className="text-sm font-medium"
                >
                  Excluded authors
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Skip automatic reviews for these GitHub users or bots.
                </p>
                <div className="mt-4 flex gap-2">
                  <Input
                    id="excluded-author"
                    value={author}
                    onChange={(event) => {
                      setAuthor(event.target.value)
                      setAuthorError(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        addAuthor()
                      }
                    }}
                    aria-invalid={Boolean(authorError)}
                    aria-describedby={authorError ? "author-error" : undefined}
                    placeholder="dependabot[bot]"
                    className="h-9 min-w-0 bg-background/40 font-mono text-xs md:text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAuthor}
                    className="h-9 shrink-0 text-xs"
                  >
                    <Plus className="size-3.5" />
                    Add
                  </Button>
                </div>
                {authorError ? (
                  <p
                    id="author-error"
                    role="alert"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    {authorError}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {settings.excludedAuthors.map((entry) => (
                    <span
                      key={entry}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 py-1 pl-2.5 pr-1 font-mono text-[10px]"
                    >
                      {entry}
                      <button
                        type="button"
                        aria-label={`Remove ${entry}`}
                        onClick={() =>
                          update(
                            "excludedAuthors",
                            settings.excludedAuthors.filter(
                              (value) => value !== entry,
                            ),
                          )
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pb-8 pt-5">
            <div>
              <p className="text-xs text-muted-foreground">
                {repositoryName ? (
                  <>
                    Applies to{" "}
                    <span className="font-mono text-foreground">
                      {repositoryName}
                    </span>
                  </>
                ) : (
                  "Connect a repository to save these preferences."
                )}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Changes take effect on the next review. Use Regenerate on an
                existing PR to update its GitHub review comment.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(true)}
              className="text-xs text-muted-foreground"
            >
              Reset to defaults
            </Button>
          </div>
        </fieldset>
        <SummaryPreview settings={settings} />
      </div>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset review settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This resets the form to Supercode’s defaults. Nothing changes on
              the server until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSettings(DEFAULT_REVIEW_SETTINGS)
                setSaveError(null)
              }}
            >
              Reset form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ReviewSettingsPage() {
  const queryClient = useQueryClient()
  const [repositoryId, setRepositoryId] = useState<string | null>(null)
  const [pendingRepositoryId, setPendingRepositoryId] = useState<string | null>(
    null,
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const query = useQuery({
    queryKey: ["review-settings-repositories"],
    queryFn: async () => {
      const result = await getReviewSettingsRepositories()
      if (!result.success) throw new Error(result.error)
      return result.repositories
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  })
  const repositories = query.data ?? []
  const repository =
    repositories.find((entry) => entry.id === repositoryId) ?? repositories[0]

  async function save(settings: ReviewSettings) {
    if (!repository)
      return { success: false, error: "Connect a repository before saving." }
    setSaving(true)
    try {
      const result = await saveReviewSettings(repository.id, settings)
      if (result.success)
        queryClient.setQueryData<typeof repositories>(
          ["review-settings-repositories"],
          (current) =>
            current?.map((entry) =>
              entry.id === repository.id
                ? { ...entry, settings: result.settings }
                : entry,
            ),
        )
      return result
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-background px-5 pb-8 pt-7 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard/settings"
          className="mb-6 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Settings
        </Link>
        <header className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <GitPullRequest className="size-3.5" />
              <span className="font-mono uppercase tracking-[0.12em]">
                Supercode Review
              </span>
            </div>
            <h1 className="text-2xl font-medium tracking-tight">
              Reviews, your way.
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Fine-tune what gets reviewed, and how it gets shared.
            </p>
          </div>
          <div className="sm:w-72">
            <label
              id="repository-label"
              className="mb-2 block text-[10px] text-muted-foreground"
            >
              Repository scope
            </label>
            <Select
              value={repository?.id ?? ""}
              disabled={!repositories.length || saving}
              onValueChange={(value) => {
                if (dirty) setPendingRepositoryId(value)
                else setRepositoryId(value)
              }}
            >
              <SelectTrigger
                aria-labelledby="repository-label"
                className="w-full bg-card/40 text-xs"
              >
                <GitBranch className="size-3.5" />
                <SelectValue
                  placeholder={
                    query.isPending
                      ? "Loading repositories…"
                      : "Select a repository"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((entry) => (
                  <SelectItem
                    key={entry.id}
                    value={entry.id}
                    className="text-xs"
                  >
                    {entry.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>
        {query.isPending ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-border p-8 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Loading review settings…
          </div>
        ) : (
          <>
            {query.isError ? (
              <div
                role="alert"
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4"
              >
                <div className="max-w-2xl">
                  <p className="text-xs font-medium">
                    Settings are unavailable
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {query.error.message} You can still explore the preview
                    below.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isFetching}
                  onClick={() => query.refetch()}
                >
                  {query.isFetching ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  Retry
                </Button>
              </div>
            ) : !repositories.length ? (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4">
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-medium">
                      Try it out, then connect a repository
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Explore the controls and preview. Connect a repo to save
                      your configuration.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/providers">
                    Connect repository
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            ) : null}
            <ReviewSettingsEditor
              key={repository?.id ?? "preview"}
              initialSettings={repository?.settings ?? DEFAULT_REVIEW_SETTINGS}
              repositoryName={repository?.fullName}
              canSave={Boolean(repository)}
              onDirtyChange={setDirty}
              onSave={save}
            />
          </>
        )}
        <AlertDialog
          open={Boolean(pendingRepositoryId)}
          onOpenChange={(open) => {
            if (!open) setPendingRepositoryId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your edits haven’t been saved. Switching repositories will
                discard them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setRepositoryId(pendingRepositoryId)
                  setPendingRepositoryId(null)
                  setDirty(false)
                }}
              >
                Discard and switch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
