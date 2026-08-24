"use client"

import React from "react"
import { FileText } from "lucide-react"

export default function LogsPage() {
  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Logs
          </h1>
          <p className="text-xs text-muted-foreground/60">
            Review agent activity and code review history
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/10 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No logs yet. Connected repository reviews will show up here.
        </p>
      </div>
    </div>
  )
}
