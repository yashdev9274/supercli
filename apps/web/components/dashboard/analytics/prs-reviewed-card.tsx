"use client"

import { AnalyticsChartCard } from "./analytics-chart-card"
import { DailyMetric } from "@/modules/dashboard/actions/analytics"
import { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  prs: {
    label: "PRs Reviewed",
    color: "#6366f1",
  },
} satisfies ChartConfig

interface PRsReviewedCardProps {
  data: DailyMetric[]
}

export function PRsReviewedCard({ data }: PRsReviewedCardProps) {
  const totalPRs = data.reduce((sum, d) => sum + d.value, 0)

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    prs: d.value,
  }))

  return (
    <AnalyticsChartCard
      title="PRs Reviewed by Greptile"
      chartType="bar"
      data={chartData}
      dataKey="prs"
      config={chartConfig}
      stat={{
        value: `${totalPRs} total`,
        change: 11,
      }}
    />
  )
}
