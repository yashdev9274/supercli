"use client"

import { AnalyticsChartCard } from "./analytics-chart-card"
import { DailyMetric } from "@/modules/dashboard/actions/analytics"
import { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  bugs: {
    label: "Bugs",
    color: "#ef4444",
  },
} satisfies ChartConfig

interface BugsCaughtCardProps {
  data: DailyMetric[]
}

export function BugsCaughtCard({ data }: BugsCaughtCardProps) {
  const totalBugs = data.reduce((sum, d) => sum + d.value, 0)

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    bugs: d.value,
  }))

  return (
    <AnalyticsChartCard
      title="Bugs Caught"
      filters={[{ label: "All Severity", value: "all" }]}
      chartType="bar"
      data={chartData}
      dataKey="bugs"
      config={chartConfig}
      stat={{
        value: `${totalBugs} total`,
      }}
    />
  )
}
