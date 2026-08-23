"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SynthesisReport } from "@/modules/dashboard/actions/analytics"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface SynthesisReportCardProps {
  synthesis: SynthesisReport
}

const trendIcon = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
}

const trendColor = {
  up: "text-emerald-400",
  down: "text-red-400",
  flat: "text-neutral-400",
}

export function SynthesisReportCard({ synthesis }: SynthesisReportCardProps) {
  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-white text-base font-medium">
            Synthesis Report
          </CardTitle>
          <span className="text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-md">
            {synthesis.period}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-300 leading-relaxed">
          {synthesis.summary}
        </p>

        {synthesis.highlights.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
              Highlights
            </h4>
            <ul className="space-y-1.5">
              {synthesis.highlights.map((highlight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                  <span className="text-indigo-400 mt-0.5">•</span>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        )}

        {synthesis.metrics.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
              Key Metrics
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {synthesis.metrics.map((metric, i) => {
                const Icon = trendIcon[metric.trend]
                return (
                  <div
                    key={i}
                    className="bg-neutral-800/50 p-3"
                  >
                    <p className="text-xs text-neutral-400 mb-1">
                      {metric.label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-white">
                        {metric.value}
                      </span>
                      <Icon
                        className={cn("w-4 h-4", trendColor[metric.trend])}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
