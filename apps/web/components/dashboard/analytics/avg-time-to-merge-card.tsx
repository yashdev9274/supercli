"use client"

import { AnalyticsChartCard } from "./analytics-chart-card"
import { DailyMetric } from "@/modules/dashboard/actions/analytics"
import { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  mergeTime: {
    label: "Avg Days",
    color: "#6366f1",
  },
} satisfies ChartConfig

interface AvgTimeToMergeCardProps {
  data: DailyMetric[]
}

export function AvgTimeToMergeCard({ data }: AvgTimeToMergeCardProps) {
  const avgTime =
    data.reduce((sum, d) => sum + d.value, 0) / (data.length || 1)

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    mergeTime: d.value,
  }))

  return (
    <AnalyticsChartCard
      title="Average Time to Merge"
      filters={[{ label: "Mean", value: "mean" }]}
      chartType="area"
      data={chartData}
      dataKey="mergeTime"
      config={chartConfig}
      stat={{
        value: `${avgTime.toFixed(1)}d avg`,
      }}
    />
  )
}
