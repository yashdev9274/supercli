"use client"

import { Suspense } from "react"
import { IntegrationsPage } from "@/modules/integrations/components/integrations-page"
import { Blocks, Loader2 } from "lucide-react"

function IntegrationsFallback() {
  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20">
          <Blocks className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Integrations
          </h1>
          <p className="text-xs text-muted-foreground/60">Loading apps…</p>
        </div>
      </div>
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    </div>
  )
}

export default function DashboardIntegrationsPage() {
  return (
    <Suspense fallback={<IntegrationsFallback />}>
      <IntegrationsPage />
    </Suspense>
  )
}
