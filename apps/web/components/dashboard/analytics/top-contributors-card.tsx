"use client"

import { AnalyticsChartCard } from "./analytics-chart-card"
import { ContributorMetric } from "@/modules/dashboard/actions/analytics"
import { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  prs: {
    label: "Merged PRs",
    color: "#6366f1",
  },
} satisfies ChartConfig

interface TopContributorsCardProps {
  data: ContributorMetric[]
}

export function TopContributorsCard({ data }: TopContributorsCardProps) {
  const chartData = data
    .slice(0, 8)
    .map((d) => ({
      name: d.login,
      prs: d.prs,
    }))

  return (
    <AnalyticsChartCard
      title="Top Contributors"
      chartType="bar"
      data={chartData}
      dataKey="prs"
      xAxisKey="name"
      config={chartConfig}
      infoIcon
    />
  )
}
