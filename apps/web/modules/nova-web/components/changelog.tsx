"use client"

import { useState } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Cpu,
  FolderOpen,
  GitPullRequest,
  Globe,
  Link2,
  MessageSquare,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { LATEST_NOVA_RELEASE, NOVA_RELEASES } from "@/modules/nova-web/changelog"

const FEATURE_ICONS = {
  threads: MessageSquare,
  folders: FolderOpen,
  automations: Zap,
  reviews: GitPullRequest,
  security: ShieldCheck,
  connections: Link2,
  machines: Server,
  models: Cpu,
  browser: Globe,
  control: SlidersHorizontal,
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf]"

function ReleaseBanner({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-slot="release-banner"
      className={cn(
        "relative block w-full shrink-0 overflow-hidden border-b border-white/[0.06] bg-[#191919]",
        compact ? "aspect-video" : "aspect-video max-h-[340px]",
      )}
    >
      <Image
        src="/nova-changelog-v1.png"
        alt=""
        fill
        sizes={compact ? "228px" : "(max-width: 767px) calc(100vw - 2rem), 760px"}
        className="object-cover"
      />
    </span>
  )
}

export function NovaChangelog() {
  const [showArchive, setShowArchive] = useState(false)
  const [releaseIndex, setReleaseIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const release = NOVA_RELEASES[releaseIndex] ?? LATEST_NOVA_RELEASE

  if (dismissed) return null

  return (
    <Dialog onOpenChange={(open) => {
      if (open) {
        setShowArchive(false)
        setReleaseIndex(0)
      }
    }}>
      <div className="group/release relative shrink-0 px-2 pb-3 pt-1">
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Read what’s new in Nova v${LATEST_NOVA_RELEASE.version}`}
            className={cn("group block w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#131313] text-left transition-colors hover:border-white/[0.16] hover:bg-[#171717]", focusRing)}
          >
            <ReleaseBanner compact />
            <span className="block px-3.5 py-3.5">
              <span className="flex items-center gap-2 text-[13px] font-medium text-[#e8e8e8]">
                Nova v{LATEST_NOVA_RELEASE.version}
                <span className="rounded bg-[#2dd4bf]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#2dd4bf]">New</span>
                <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5 text-[#777] transition-colors group-hover:text-[#ddd]" />
              </span>
              <span className="mt-1.5 block text-[12px] leading-5 text-[#999]">Your AI engineering workspace is here.</span>
            </span>
          </button>
        </DialogTrigger>
        <button
          type="button"
          aria-label="Dismiss changelog card"
          onClick={() => setDismissed(true)}
          className={cn("absolute right-4 top-3 flex size-6 items-center justify-center rounded-md border border-white/10 bg-[#111111] text-[#aaa] opacity-0 transition hover:bg-[#252525] hover:text-white group-hover/release:opacity-100 group-focus-within/release:opacity-100 [@media(hover:none)]:opacity-100", focusRing)}
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-white/[0.1] bg-[#111111] p-0 text-[#e8e8e8] shadow-2xl sm:max-w-[760px]"
        overlayClassName="bg-black/70 backdrop-blur-sm"
      >
        {showArchive ? (
          <>
            <div className="shrink-0 border-b border-white/[0.07] px-6 py-6 sm:px-8">
              <DialogTitle className="text-xl tracking-tight">What’s new in Nova</DialogTitle>
              <DialogDescription className="mt-2 text-[13px] text-[#929292]">New capabilities, improvements, and everything we ship.</DialogDescription>
            </div>
            <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
              {NOVA_RELEASES.map((item, index) => (
                <button
                  key={item.version}
                  type="button"
                  onClick={() => { setReleaseIndex(index); setShowArchive(false) }}
                  className={cn("group block w-full overflow-hidden rounded-xl border border-white/[0.08] text-left transition hover:border-white/20", focusRing)}
                >
                  <ReleaseBanner />
                  <span className="block p-5">
                    <span className="flex items-center justify-between gap-3 text-[11px] text-[#929292]">
                      <span>Nova v{item.version}</span>
                      <time dateTime={item.date}>{item.dateLabel}</time>
                    </span>
                    <span className="mt-2 flex items-center gap-3 text-[16px] font-medium">
                      {item.title}
                      <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-[#777] group-hover:text-white" />
                    </span>
                    <span className="mt-2 block text-[12px] leading-5 text-[#929292]">{item.summary}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="shrink-0 border-t border-white/[0.07] px-6 py-4 text-[11px] text-[#888] sm:px-8">The beginning of Nova. More to come.</div>
          </>
        ) : (
          <>
            <div key={release.version} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ReleaseBanner />
              <article className="px-6 pb-7 pt-6 sm:px-8">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#929292]">
                  <span className="font-medium text-[#2dd4bf]">Nova v{release.version}</span>
                  <span aria-hidden="true" className="size-0.5 rounded-full bg-[#555]" />
                  <time dateTime={release.date}>{release.dateLabel}</time>
                  <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#aaa]">Launch release</span>
                </div>
                <DialogTitle className="mt-4 max-w-[440px] text-[25px] leading-[1.2] font-medium tracking-[-0.035em] sm:text-[30px]">{release.title}</DialogTitle>
                <DialogDescription className="mt-3 text-[13px] leading-6 text-[#aaa]">{release.introduction}</DialogDescription>
                <h2 className="mb-6 mt-7 border-t border-white/[0.07] pt-6 text-[10px] font-medium uppercase tracking-[0.14em] text-[#777]">Included in v{release.version}</h2>
                <ul className="space-y-6">
                  {release.features.map((feature) => {
                    const Icon = FEATURE_ICONS[feature.icon]
                    return (
                      <li key={feature.icon} className="flex gap-3.5">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-[#aaa]">
                          <Icon aria-hidden="true" className="size-4" strokeWidth={1.6} />
                        </span>
                        <div>
                          <h3 className="text-[13px] font-medium leading-5 text-[#e4e4e4]">{feature.title}</h3>
                          <p className="mt-1 text-[12px] leading-[1.8] text-[#929292]">{feature.description}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-7 text-[11px] leading-5 text-[#777]">Some features require connected accounts, provider credentials, or cloud services configured for your workspace.</p>
              </article>
            </div>
            <div className="shrink-0 border-t border-white/[0.07] bg-[#111111] px-6 pb-4 pt-4 sm:px-8">
              <DialogClose asChild>
                <button type="button" className={cn("h-10 w-full rounded-lg bg-[#2dd4bf] text-[13px] font-semibold text-[#071b17] transition hover:bg-[#5eead4]", focusRing)}>Got it</button>
              </DialogClose>
              <div className="mt-3.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-[#777]">Our first release</span>
                <button type="button" onClick={() => setShowArchive(true)} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[#aaa] transition hover:bg-white/5 hover:text-white", focusRing)}>All releases <ChevronRight aria-hidden="true" className="size-3" /></button>
              </div>
            </div>
          </>
        )}
        {showArchive ? (
          <DialogClose asChild>
            <button type="button" className={cn("mx-6 mb-5 flex items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[12px] text-[#aaa] hover:bg-white/5 sm:mx-8", focusRing)}><ArrowLeft aria-hidden="true" className="size-3.5" />Back to Nova</button>
          </DialogClose>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
