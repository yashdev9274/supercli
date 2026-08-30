"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowUpRight, Blocks, Settings2 } from "lucide-react"
import { ProfileForm } from "@/modules/setings/components/profile-form"
import { RepositoryList } from "@/modules/setings/components/repository-list"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const easeOut = [0.23, 1, 0.32, 1] as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 px-0.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/45 uppercase">
      {children}
    </h2>
  )
}

const SettingPage = () => {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background p-4 pt-8 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: easeOut }}
        className="mb-10"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/20">
            <Settings2 className="h-5 w-5 text-foreground/80" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Settings
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
              Account, integrations, and connected repositories
            </p>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.04, ease: easeOut }}
        >
          <SectionLabel>Account</SectionLabel>
          <ProfileForm />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08, ease: easeOut }}
        >
          <SectionLabel>Integrations</SectionLabel>
          <div className="rounded-xl border border-border bg-card/40 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/15">
                  <Blocks className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Slack & Linear
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/70">
                    Route PR review notifications through Composio-connected
                    workspaces.
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 shrink-0 rounded-lg text-xs",
                  "transition-transform duration-160 ease-out",
                  "active:scale-[0.97]",
                )}
              >
                <Link href="/dashboard/integrations" className="gap-1.5">
                  Manage integrations
                  <ArrowUpRight className="size-3.5 opacity-60" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12, ease: easeOut }}
          className="pb-8"
        >
          <SectionLabel>Repositories</SectionLabel>
          <RepositoryList />
        </motion.section>
      </div>
    </div>
  )
}

export default SettingPage
