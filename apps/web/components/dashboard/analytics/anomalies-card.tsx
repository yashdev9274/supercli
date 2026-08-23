"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Anomaly } from "@/modules/dashboard/actions/analytics"
import { AlertTriangle, TrendingDown, TrendingUp, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnomaliesCardProps {
  anomalies: Anomaly[]
}

const severityConfig = {
  critical: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: AlertTriangle,
    badge: "bg-red-500/20 text-red-400",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    icon: TrendingUp,
    badge: "bg-amber-500/20 text-amber-400",
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    icon: Clock,
    badge: "bg-blue-500/20 text-blue-400",
  },
}

const typeIcon = {
  spike: TrendingUp,
  drop: TrendingDown,
  trend_break: AlertTriangle,
  stale: Clock,
}

export function AnomaliesCard({ anomalies }: AnomaliesCardProps) {
  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base font-medium flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Detected Anomalies
        </CardTitle>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-sm text-neutral-400">All metrics look healthy</p>
            <p className="text-xs text-neutral-500 mt-1">No anomalies detected in the last 30 days</p>
          </div>
        ) : (
          <div className="space-y-3">
            {anomalies.slice(0, 5).map((anomaly) => {
              const severity = severityConfig[anomaly.severity]
              const TypeIcon = typeIcon[anomaly.type]
              return (
                <div
                  key={anomaly.id}
                  className={cn(
                    "p-3 border",
                    severity.bg,
                    severity.border
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        severity.badge
                      )}
                    >
                      <TypeIcon className={cn("w-4 h-4", severity.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-white font-medium">
                          {anomaly.metric}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-medium",
                            severity.badge
                          )}
                        >
                          {anomaly.severity}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-300">{anomaly.message}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-500">
                        <span>Value: {anomaly.value}</span>
                        <span>Expected: {anomaly.expected}</span>
                        <span>{new Date(anomaly.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
