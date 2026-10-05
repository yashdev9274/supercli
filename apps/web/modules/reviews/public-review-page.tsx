"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitPullRequest,
  Github,
  Loader2,
  ShieldCheck,
} from "lucide-react"

import type { PrDiffFile, ReviewDetail } from "@/modules/dashboard/actions"
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
import {
  PrWorkspace,
  type PrTab,
} from "@/modules/pull-requests/components/pr-workspace"
import { parsePublicPrUrl } from "@/modules/reviews/public-pr-url"
import { MermaidThemeContext } from "@/modules/reviews/components/mermaid-diagram"

import "./public-review.css"

type ReviewResponse = {
  review: Omit<ReviewDetail, "createdAt" | "updatedAt"> & {
    createdAt: string
    updatedAt?: string
  }
  files: PrDiffFile[]
  headSha: string
}

type ReviewResult = {
  review: ReviewDetail
  files: PrDiffFile[]
  headSha: string
}

type Phase = "idle" | "fetching" | "reviewing" | "completed" | "failed"

const EXAMPLE_PRS = [
  { label: "vercel/next.js", number: 99669 },
  { label: "react/react", number: 37739 },
  { label: "oven-sh/bun", number: 44560 },
]

async function readReviewResponse(response: Response): Promise<ReviewResult> {
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || "The review could not be completed. Try again.")
  }
  const data = payload as ReviewResponse
  return {
    ...data,
    review: {
      ...data.review,
      createdAt: new Date(data.review.createdAt),
      updatedAt: data.review.updatedAt ? new Date(data.review.updatedAt) : undefined,
    },
  }
}

export function PublicReviewPage({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [tab, setTab] = useState<PrTab>("Overview")
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishPending, setPublishPending] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [connectRequired, setConnectRequired] = useState(false)
  const [publishedReview, setPublishedReview] = useState<{
    prUrl: string
    headSha: string
    markdown: string
    commentUrl: string
  } | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const publishRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const busy = phase === "fetching" || phase === "reviewing"
  const added = Boolean(publishedReview && result &&
    publishedReview.prUrl === result.review.prUrl &&
    publishedReview.headSha === result.headSha &&
    publishedReview.markdown === result.review.review)

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
    publishRef.current?.abort()
    publishRef.current = null
  }, [])

  async function reviewPr(value: string) {
    if (requestRef.current || publishRef.current) return
    let canonicalUrl: string
    try {
      canonicalUrl = parsePublicPrUrl(value).url
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a public GitHub PR URL.")
      inputRef.current?.focus()
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 270_000)
    setUrl(canonicalUrl)
    setError(null)
    setPhase("fetching")

    try {
      const preview = await readReviewResponse(await fetch(
        `/api/public-reviews?url=${encodeURIComponent(canonicalUrl)}`,
        { signal: controller.signal, credentials: "omit" },
      ))
      if (preview.review.status === "completed" && preview.review.review.trim()) {
        setResult(preview)
        setTab("Overview")
        setPhase("completed")
        return
      }
      setResult({ ...preview, review: { ...preview.review, status: "pending" } })
      setTab("Overview")
      setPhase("reviewing")

      const completed = await readReviewResponse(await fetch("/api/public-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: canonicalUrl }),
        signal: controller.signal,
        credentials: "omit",
      }))
      setResult(completed)
      setPhase("completed")
    } catch (cause) {
      if (requestRef.current !== controller) return
      const message = controller.signal.aborted
        ? "This review took too long. Try again in a moment; a completed review may be cached."
        : cause instanceof Error ? cause.message : "Something went wrong. Please try again."
      setError(message)
      setResult((current) => current ? {
        ...current,
        review: { ...current.review, status: "failed", review: message },
      } : null)
      setPhase("failed")
    } finally {
      window.clearTimeout(timeout)
      requestRef.current = null
    }
  }

  function startAnotherReview() {
    if (busy || publishPending) return
    setResult(null)
    setPhase("idle")
    setError(null)
    setUrl("")
    setPublishedReview(null)
    setPublishError(null)
    setPublishOpen(false)
    setConnectRequired(false)
  }

  async function publishCurrentReview() {
    if (!result || phase !== "completed" || busy || publishRef.current) return
    const selected = result
    const controller = new AbortController()
    publishRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 120_000)
    setPublishPending(true)
    setPublishError(null)
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(selected.review.review.trim()))
      const reviewHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
      const response = await fetch("/api/public-reviews/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url: selected.review.prUrl, headSha: selected.headSha, reviewHash }),
        signal: controller.signal,
      })
      const data = await response.json()
      if (response.status === 401 || data.code === "GITHUB_CONNECT_REQUIRED") {
        setConnectRequired(true)
        return
      }
      if (!response.ok) throw new Error(data.error || "The review could not be posted to GitHub.")
      const commentUrl = new URL(data.commentUrl)
      if (commentUrl.protocol !== "https:" || commentUrl.hostname !== "github.com" ||
        commentUrl.username || commentUrl.password ||
        commentUrl.pathname.toLowerCase() !== new URL(selected.review.prUrl).pathname.toLowerCase() ||
        !/^#issuecomment-[1-9]\d*$/.test(commentUrl.hash)) {
        throw new Error("GitHub did not return a valid comment link. Check the PR before trying again.")
      }
      setPublishedReview({
        prUrl: selected.review.prUrl,
        headSha: selected.headSha,
        markdown: selected.review.review,
        commentUrl: commentUrl.href,
      })
      setPublishOpen(false)
    } catch (cause) {
      if (publishRef.current !== controller) return
      setPublishError(controller.signal.aborted
        ? "Posting took too long. Check the GitHub PR before trying again."
        : cause instanceof Error ? cause.message : "The review could not be posted to GitHub.")
    } finally {
      window.clearTimeout(timeout)
      if (publishRef.current === controller) {
        publishRef.current = null
        setPublishPending(false)
      }
    }
  }

  return (
    <div className={`dark public-review-page ${result ? "public-review-workspace" : ""}`}>
      <header className="public-review-header">
        <Link href="/code-review" className="public-review-brand" aria-label="Supercode Review home">
          <Image src="/supercode-logo.png" alt="" width={24} height={24} className="rounded-md" />
          <span>Supercode</span>
          <span className="public-review-brand-divider hidden min-[380px]:inline" aria-hidden="true">/</span>
          <span className="public-review-brand-product hidden min-[380px]:inline">Review</span>
        </Link>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        {result ? (
          <button
            type="button"
            onClick={startAnotherReview}
            disabled={busy || publishPending}
            aria-label="Review another PR"
            className="public-review-nav-link disabled:cursor-wait disabled:opacity-40"
          >
            <span className="hidden sm:inline">Review another PR</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : null}
          <Link href="/dashboard" prefetch={false} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-[12px] font-medium text-background transition-colors duration-150 hover:bg-foreground/90">
            <Github size={14} aria-hidden="true" />
            Connect GitHub
          </Link>
        </div>
      </header>

      {result ? (
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="public-review-status" role="status" aria-live="polite">
            <div className="flex min-w-0 items-center gap-2">
              {busy ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" /> :
                phase === "completed" ? <Check size={13} className="text-emerald-400" /> : <ShieldCheck size={13} />}
              <span>{busy ? `Reviewing ${result.files.length} changed ${result.files.length === 1 ? "file" : "files"}…` :
                phase === "completed" ? "Review complete" : "Review interrupted"}</span>
              <span className="hidden text-muted-foreground/50 sm:inline">· Public, read-only review</span>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
              {result.headSha.slice(0, 7)}
            </span>
          </div>
          {error ? <p role="alert" className="public-review-workspace-error">{error}</p> : null}
          {added && publishedReview ? (
            <p role="status" className="border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
              Review added to GitHub.{" "}
              <a href={publishedReview.commentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">View comment</a>
            </p>
          ) : null}
          <MermaidThemeContext.Provider value="dark">
            <PrWorkspace
              key={result.review.prUrl}
              activeId={result.review.id}
              review={result.review}
              files={result.files}
              filesLoading={false}
              tab={tab}
              onTabChange={setTab}
              isGenerating={busy}
              completed={phase === "completed"}
              showGenerate={phase === "failed"}
              onGenerate={() => reviewPr(result.review.prUrl)}
              generatePending={busy}
              reviewMode="public"
              publishReview={{
                pending: publishPending,
                added: Boolean(added),
                onPublish: () => {
                  setPublishError(null)
                  setConnectRequired(false)
                  setPublishOpen(true)
                },
              }}
            />
          </MermaidThemeContext.Provider>
          <footer className="public-review-workspace-footer">
            AI-generated analysis. Verify findings before merging. Nothing is posted unless you choose Add review.
          </footer>
        </main>
      ) : (
        <>
          <main className="public-review-main">
            <div className="public-review-announcement">
              <ShieldCheck size={14} aria-hidden="true" />
              Security, bugs, and the details that matter.
              <ArrowRight size={13} aria-hidden="true" />
            </div>

            <div className="public-review-hero">
              <p className="public-review-eyebrow">A SECOND SET OF EYES</p>
              <h1>
                <span className="public-review-wordmark">Supercode</span>{" "}
                <span className="public-review-wordmark public-review-wordmark-red">Review</span>
                <br />
                Ship with confidence.
              </h1>
              <p className="public-review-description">
                Understand the changes. Catch the bugs. Explore every diff.{" "}
                <br className="hidden sm:block" />
                A thoughtful code review, one pull request away.
              </p>

              <form
                className="public-review-form"
                onSubmit={(event) => { event.preventDefault(); reviewPr(url) }}
                aria-busy={busy}
              >
                <label htmlFor="public-pr-url">Review your next public pull request</label>
                <div className="public-review-input-wrap">
                  <Github size={20} aria-hidden="true" className="public-review-input-icon" />
                  <input
                    ref={inputRef}
                    id="public-pr-url"
                    name="prUrl"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="github.com/owner/repo/pull/123"
                    value={url}
                    onChange={(event) => { setUrl(event.target.value); setError(null) }}
                    required
                    maxLength={2048}
                    disabled={busy}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "public-review-error public-review-note" : "public-review-note"}
                  />
                  <button type="submit" disabled={busy || !url.trim()} aria-label="Review pull request">
                    {busy ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" /> :
                      <ArrowRight size={20} aria-hidden="true" />}
                  </button>
                </div>
                {error ? <p id="public-review-error" className="public-review-error" role="alert">{error}</p> : null}
                {busy ? <p className="public-review-fetching" role="status">Fetching your public pull request…</p> : null}
                <p id="public-review-note" className="public-review-note">
                  Free for public PRs. No sign-up. No installation.
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">
                    Up to 50 files and 2,500 changed lines. Usage limits apply.
                  </span>
                </p>
              </form>

              <div className="public-review-examples">
                <span>Try a PR</span>
                {EXAMPLE_PRS.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setUrl(`https://github.com/${example.label}/pull/${example.number}`)
                      setError(null)
                      inputRef.current?.focus()
                    }}
                  >
                    <GitPullRequest size={12} aria-hidden="true" />
                    {example.label}<span className="opacity-50">#{example.number}</span>
                  </button>
                ))}
              </div>
            </div>

            <section className="public-review-steps" aria-label="How public review works">
              <div><span>01</span><h2>Paste a PR link</h2><p>Any public GitHub pull request.{" "}<br />Open, closed, or merged.</p></div>
              <div><span>02</span><h2>Get a considered review</h2><p>The same Supercode review engine.{" "}<br />Grounded in the actual changes.</p></div>
              <div><span>03</span><h2>Go deeper into the diff</h2><p>Findings, a walkthrough, and changed files.{" "}<br />All in one workspace.</p></div>
            </section>
          </main>

          <footer className="public-review-footer">
            <p><ShieldCheck size={13} aria-hidden="true" /> Public repositories only. Reviewing doesn’t post to GitHub.</p>
            <Link href="/code-review">About Supercode Review <ArrowUpRight size={12} aria-hidden="true" /></Link>
          </footer>
        </>
      )}
      <AlertDialog open={publishOpen} onOpenChange={(open) => { if (!publishPending) setPublishOpen(open) }}>
        <AlertDialogContent className="dark public-review-confirmation text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{connectRequired ? "Connect GitHub to add your review" : "Add this review to GitHub?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {connectRequired
                ? "Create an account or connect GitHub in the dashboard, then return here to post this review. Reviewing public PRs is still free without signing in."
                : `This will publish the displayed review as a comment on ${result?.review.repository.fullName}#${result?.review.prNumber}, using your connected GitHub account.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!connectRequired && result ? <p className="text-[12px] text-muted-foreground">Reviewed commit <code className="font-mono">{result.headSha.slice(0, 7)}</code>. No approval or change request will be submitted.</p> : null}
          {publishError ? <p role="alert" className="text-[13px] leading-relaxed text-red-400">{publishError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={publishPending} onClick={(event) => {
              if (connectRequired) {
                router.push("/dashboard")
              } else {
                event.preventDefault()
                publishCurrentReview()
              }
            }}>
              {connectRequired ? <><Github className="h-4 w-4" /> Connect GitHub</>
                : publishPending ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Posting…</>
                : "Post review comment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
