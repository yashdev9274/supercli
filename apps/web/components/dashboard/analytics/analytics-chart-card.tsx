"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Bar, BarChart, Line, LineChart, Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface Filter {
  label: string
  value: string
}

interface AnalyticsChartCardProps {
  title: string
  filters?: Filter[]
  chartType: "bar" | "line" | "area"
  data: Record<string, any>[]
  dataKey: string
  xAxisKey?: string
  config: ChartConfig
  stat?: {
    value: string
    change?: number
  }
  infoIcon?: boolean
  onInfoClick?: () => void
}

export function AnalyticsChartCard({
  title,
  filters,
  chartType,
  data,
  dataKey,
  xAxisKey = "date",
  config,
  stat,
  infoIcon,
  onInfoClick,
}: AnalyticsChartCardProps) {
  const [activeFilter, setActiveFilter] = useState(
    filters?.[0]?.value || "all"
  )

  const ChartComponent =
    chartType === "bar" ? Bar : chartType === "line" ? Line : Area

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-white text-base font-medium">
              {title}
            </CardTitle>
            {filters && filters.length > 0 && (
              <div className="flex gap-1">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => setActiveFilter(filter.value)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md transition-colors",
                      activeFilter === filter.value
                        ? "bg-neutral-700 text-white"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stat && (
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium">
                  {stat.value}
                </span>
                {stat.change !== undefined && (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      stat.change >= 0 ? "text-emerald-500" : "text-red-500"
                    )}
                  >
                    {stat.change >= 0 ? "+" : ""}
                    {stat.change}%
                  </span>
                )}
              </div>
            )}
            {infoIcon && (
              <button
                onClick={onInfoClick}
                className="w-5 h-5 rounded-full border border-neutral-600 flex items-center justify-center text-neutral-400 hover:text-white hover:border-neutral-400 transition-colors text-xs"
              >
                i
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <ChartContainer config={config} className="h-[200px] w-full">
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey={dataKey}
                fill={config[dataKey]?.color || "#6366f1"}
                radius={[3, 3, 0, 0]}
                maxBarSize={16}
              />
            </BarChart>
          ) : chartType === "line" ? (
            <LineChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={config[dataKey]?.color || "#6366f1"}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a3a3a3" }}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <defs>
                <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config[dataKey]?.color || "#6366f1"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={config[dataKey]?.color || "#6366f1"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={config[dataKey]?.color || "#6366f1"}
                fill={`url(#gradient-${dataKey})`}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
