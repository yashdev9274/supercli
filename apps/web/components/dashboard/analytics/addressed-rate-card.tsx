"use client"

import { AnalyticsChartCard } from "./analytics-chart-card"
import { DailyMetric } from "@/modules/dashboard/actions/analytics"
import { ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  rate: {
    label: "Addressed %",
    color: "#10b981",
  },
} satisfies ChartConfig

interface AddressedRateCardProps {
  data: DailyMetric[]
}

export function AddressedRateCard({ data }: AddressedRateCardProps) {
  const avgRate =
    data.reduce((sum, d) => sum + d.value, 0) / (data.length || 1)
  const recentRate = data.slice(-7)
  const prevRate = data.slice(-14, -7)
  const recentAvg =
    recentRate.reduce((s, d) => s + d.value, 0) / (recentRate.length || 1)
  const prevAvg =
    prevRate.reduce((s, d) => s + d.value, 0) / (prevRate.length || 1)
  const change = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    rate: d.value,
  }))

  return (
    <AnalyticsChartCard
      title="Addressed Rate"
      chartType="line"
      data={chartData}
      dataKey="rate"
      config={chartConfig}
      stat={{
        value: `${Math.round(avgRate)}%`,
        change,
      }}
    />
  )
}
