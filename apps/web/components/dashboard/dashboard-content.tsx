"use client";

import React, { useState } from "react";
import { 
  Clock, 
  Smile, 
  MessageSquare, 
  Trophy, 
  ChevronDown, 
  Box, 
  User, 
  Calendar,
  AlertCircle,
  ListChecks,
  TrendingUp,
  Activity,
  GitCommit,
  Check,
  FolderGit2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {useQuery} from "@tanstack/react-query"
import { getDashboardStats, getMontlyActivity } from "@/modules/dashboard/actions";
import { getAnalyticsData, getConnectedRepos, type Timeframe, type RepoOption } from "@/modules/dashboard/actions/analytics";
import RepoMetricCard from "./metric-cards/total-repositories";
import { MetricsCard } from "./metric-cards/metrics-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ContributionGraph } from "./components/contribution-graph";
import { Spinner } from "../ui/spinner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnomaliesCard } from "./analytics/anomalies-card";
import { SynthesisReportCard } from "./analytics/synthesis-report-card";
import { PRsReviewedCard } from "./analytics/prs-reviewed-card";
import { BugsCaughtCard } from "./analytics/bugs-caught-card";
import { AvgTimeToMergeCard } from "./analytics/avg-time-to-merge-card";
import { TopContributorsCard } from "./analytics/top-contributors-card";
import { AddressedRateCard } from "./analytics/addressed-rate-card";
import { CommentRatingsCard } from "./analytics/comment-ratings-card";
import { GithubReauthBanner } from "./components/github-reauth-banner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

// interface MetricCardProps {
//   title: string;
//   value?: string;
//   badge?: string;
//   emptyIcon: React.ReactNode;
//   emptyText: string;
//   className?: string;
//   delay?: number;
// }

// function MetricCard({ title, value, badge, emptyIcon, emptyText, className, delay = 0 }: MetricCardProps) {
//   return (
//     <motion.div 
//       initial={{ opacity: 0, y: 10 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ duration: 0.4, delay }}
//       className={cn(
//         "group relative flex flex-col overflow-hidden rounded-none border border-border bg-card p-6 transition-all duration-300 hover:border-white/10",
//         className
//       )}
//     >
//       <div className="relative mb-6 flex items-center gap-3">
//         <div className="flex h-7 w-7 items-center justify-center text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/60">
//           {typeof emptyIcon === 'object' && 'type' in (emptyIcon as any) 
//             ? React.cloneElement(emptyIcon as React.ReactElement, { size: 18, strokeWidth: 1.5 } as any) 
//             : emptyIcon}
//         </div>
//         <span className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground/50 uppercase">
//           {title}
//         </span>
//       </div>
      
//       {value ? (
//         <div className="relative mb-6 flex items-baseline gap-3">
//           <span className="font-mono text-3xl font-medium tracking-tight text-foreground">{value}</span>
//           {badge && (
//             <span className="flex items-center gap-1 rounded-none bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/20">
//               <TrendingUp className="h-3 w-3" />
//               {badge}
//             </span>
//           )}
//         </div>
//       ) : (
//         <div className="relative flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
//           <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/20">
//             <div className="flex h-8 w-8 items-center justify-center text-muted-foreground/20">{emptyIcon}</div>
//           </div>
//           {/* <div className="text-2xl font-bold">{isLoading ? "..."stats?.totalRepos || 0 }</div> */}
//           <span className="max-w-[180px] text-[11px] font-medium leading-relaxed text-muted-foreground/30">
//             {emptyText}
//           </span>
//         </div>
//       )}

//       {value && (
//         <div className="mt-auto flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/20 group-hover:text-muted-foreground/30 transition-colors">
//           <Activity className="h-3 w-3" />
//           <span>Syncing live data</span>
//         </div>
//       )}
//     </motion.div>
//   );
// }

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "2w", label: "Last 14 days" },
  { value: "1m", label: "Last 30 days" },
  { value: "1q", label: "Last quarter" },
  { value: "1y", label: "Last year" },
]

export function DashboardContent() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1m")
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [repoSearch, setRepoSearch] = useState("")

  const {data: repos} = useQuery({
    queryKey: ["user-repos"],
    queryFn: async () => await getConnectedRepos(),
    refetchOnWindowFocus: false,
  })

  const filteredRepos = repos?.filter((r) =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  ) ?? []

  const {data:stats, isLoading} = useQuery({
    queryKey:["dashboard-stats"],
    queryFn: async()=>await getDashboardStats(),
    refetchOnWindowFocus:false
  })

  const {data: monthlyActivity, isLoading: isLoadingActivity }=useQuery({
    queryKey: ["monthly-stats"],
    queryFn: async()=> await getMontlyActivity(),
    refetchOnWindowFocus: false
  })

  const {data: analyticsData, isLoading: isLoadingAnalytics} = useQuery({
    queryKey: ["analytics-data", timeframe, selectedRepo],
    queryFn: async()=> await getAnalyticsData(timeframe, selectedRepo),
    refetchOnWindowFocus: false
  })
  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8">
      <GithubReauthBanner />
      {/* Header Row */}
      <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-medium tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-foreground/80">A real-time snapshot of your development cycle.</p>
        </div>
        
          <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center border border-border bg-muted/30 p-1">
            <button className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors">
              <Box className="h-3.5 w-3.5 opacity-80" />
              Repositories
              <ChevronDown className="h-3 w-3 opacity-30" />
            </button>
            <div className="h-4 w-[1px] bg-border mx-1" />
            <button className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors">
              <User className="h-3.5 w-3.5 opacity-80" />
              Authors
              <ChevronDown className="h-3 w-3 opacity-30" />
            </button>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors outline-none">
                <Calendar className="h-3.5 w-3.5 opacity-80" />
                {TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.label}
                <ChevronDown className="h-3 w-3 opacity-30" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {TIMEFRAME_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setTimeframe(option.value)}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  {option.label}
                  {timeframe === option.value && <Check className="h-3 w-3 opacity-60" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metrics Grid */}
      <div >
        {/* <MetricCard
          title="Repositories"
          value="0m"
          badge="0%"
          emptyIcon={<Clock />}
          emptyText="No merge events recorded"
          delay={0.1}
        /> */}

        {/*  repositories */}

        <MetricsCard/>

        
      </div>

      {/* Acitvity Caldendar */}

      <div className="flex flex-col gap-10">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium text-foreground">Acitvity Caldendar</h2>
            <p className="text-[10px] text-foreground/70 uppercase tracking-[0.2em] font-bold">Automated Analysis</p>
          </div>
          {/* <button className="text-[11px] font-medium text-muted-foreground/40 hover:text-foreground transition-all">Details →</button> */}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          
          <Card>
            <CardHeader>
              <div>
                
              </div>
              <div className="flex h-7 w-7 items-center justify-center text-muted-foreground/40">
                <GitCommit size={18} strokeWidth={1.5} />
              </div>
              <CardTitle>Contribution Activity</CardTitle>
              <CardDescription>Visualizing your coding frequency over the last year</CardDescription>
            </CardHeader>
            <CardContent>
              <ContributionGraph />
            </CardContent>
          </Card>
        </motion.div>

        <div className='grid gap-4 md:grid-cols-2'>
          <Card className='col-span-2'>
            <CardHeader>
              <CardTitle className="text-foreground">Activity Overview</CardTitle>
              <CardDescription className="text-foreground/80">Monthly breakdown of commits, PRs, and reviews (last 6 months)</CardDescription>
            </CardHeader>
            
            <CardContent>
            {
              isLoadingActivity ? (
                <div className="h-80 w-full flex items-center justify-center">
                  <Spinner/>
                </div>
              ) : (
                <div className='h-80 w-full'>
                  <ResponsiveContainer width={"100%"} height={"100%"}>
                    <BarChart data={monthlyActivity || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                        itemStyle={{ color: 'var(--foreground)' }}
                      />
                      <Legend/>
                      <Bar dataKey="commits" name="Commits" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="prs" name="Pull Requests" fill="#fb923c" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="reviews" name="AI Reviews" fill="#c2410c" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            }
            </CardContent>
          </Card>
        </div>
      </div>



      {/* Intelligence Section */}
      <div className="flex flex-col gap-10 mt-9">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium text-foreground">Intelligence</h2>
            <p className="text-[10px] text-foreground/70 uppercase tracking-[0.2em] font-bold">Automated Analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors outline-none">
                  <FolderGit2 className="h-3.5 w-3.5 opacity-80" />
                  {selectedRepo ?? "All Repositories"}
                  <ChevronDown className="h-3 w-3 opacity-30" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[240px] p-1">
                <div className="px-2 py-1.5">
                  <div className="flex items-center gap-2 border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
                    <Search className="h-3 w-3 opacity-50" />
                    <input
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      placeholder="Search repositories..."
                      className="w-full bg-transparent outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <DropdownMenuItem
                  onClick={() => { setSelectedRepo(null); setRepoSearch(""); }}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  All Repositories
                  {selectedRepo === null && <Check className="h-3 w-3 opacity-60" />}
                </DropdownMenuItem>
                {filteredRepos.map((repo) => (
                  <DropdownMenuItem
                    key={repo.fullName}
                    onClick={() => { setSelectedRepo(repo.fullName); setRepoSearch(""); }}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {repo.fullName}
                    </span>
                    {selectedRepo === repo.fullName && <Check className="h-3 w-3 opacity-60 shrink-0" />}
                  </DropdownMenuItem>
                ))}
                {filteredRepos.length === 0 && (
                  <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
                    No repositories found
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors outline-none">
                  <Calendar className="h-3.5 w-3.5 opacity-80" />
                  {TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.label}
                  <ChevronDown className="h-3 w-3 opacity-30" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setTimeframe(option.value)}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    {option.label}
                    {timeframe === option.value && <Check className="h-3 w-3 opacity-60" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isLoadingAnalytics ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex min-h-[360px] items-center justify-center border border-border bg-card">
                <Spinner />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <AnomaliesCard anomalies={analyticsData?.anomalies || []} />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <SynthesisReportCard synthesis={analyticsData?.synthesis || { summary: "No data available", period: "Last 30 days", highlights: [], metrics: [] }} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.7 }}>
              <PRsReviewedCard data={analyticsData?.prsReviewed || []} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.8 }}>
              <BugsCaughtCard data={analyticsData?.bugsCaught || []} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.9 }}>
              <AvgTimeToMergeCard data={analyticsData?.avgTimeToMerge || []} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.0 }}>
              <TopContributorsCard data={analyticsData?.topContributors || []} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.1 }}>
              <AddressedRateCard data={analyticsData?.addressedRate || []} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.2 }}>
              <CommentRatingsCard {...(analyticsData?.commentRatings || { upvotes: 0, downvotes: 0 })} />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
