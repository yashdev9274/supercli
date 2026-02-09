"use client";

import React from "react";
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
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {useQuery} from "@tanstack/react-query"
import { getDashboardStats, getMontlyActivity } from "@/modules/dashboard/actions";
import RepoMetricCard from "./metric-cards/total-repositories";
import { MetricsCard } from "./metric-cards/metrics-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ContributionGraph } from "./components/contribution-graph";

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

export function DashboardContent() {

  const {data:stats, isLoading} = useQuery({
    queryKey:["dashboard-stats"],
    queryFn: async()=>await getDashboardStats(),
    refetchOnWindowFocus:false
  })

  const {data: monthlyAcivity, isLoading: isLoadingActivity }=useQuery({
    queryKey: ["monthly-stats"],
    queryFn: async()=> await getMontlyActivity(),
    refetchOnWindowFocus: false
  })
  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8">
      {/* Header Row */}
      <div className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-medium tracking-tight text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground/60">A real-time snapshot of your development cycle.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center border border-border bg-muted/30 p-1">
            <button className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground transition-colors">
              <Box className="h-3.5 w-3.5 opacity-50" />
              Repositories
              <ChevronDown className="h-3 w-3 opacity-30" />
            </button>
            <div className="h-4 w-[1px] bg-border mx-1" />
            <button className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground transition-colors">
              <User className="h-3.5 w-3.5 opacity-50" />
              Authors
              <ChevronDown className="h-3 w-3 opacity-30" />
            </button>
          </div>
          
          <button className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground transition-colors">
            <Calendar className="h-3.5 w-3.5 opacity-50" />
            Time Range
            <ChevronDown className="h-3 w-3 opacity-30" />
          </button>
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
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">Automated Analysis</p>
          </div>
          {/* <button className="text-[11px] font-medium text-muted-foreground/40 hover:text-foreground transition-all">Details →</button> */}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contribution Activity</CardTitle>
            <CardDescription>Visualizing your coding frequency over the last year</CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionGraph />
          </CardContent>
        </Card>
      </div>



      {/* Activity Section */}
      <div className="flex flex-col gap-10 mt-9">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-medium text-foreground">Intelligence</h2>
            <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">Automated Analysis</p>
          </div>
          <button className="text-[11px] font-medium text-muted-foreground/40 hover:text-foreground transition-all">Details →</button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex min-h-[360px] flex-col border border-border bg-card p-8 group transition-all hover:border-white/10"
          >
            <div className="mb-10 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
                <AlertCircle className="h-4 w-4 opacity-50 transition-colors group-hover:text-foreground group-hover:opacity-100" />
                Detected Anomalies
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse shadow-[0_0_8px_rgba(255,0,0,0.5)]" />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
              <div className="flex h-20 w-20 items-center justify-center border border-border bg-muted/10">
                <AlertCircle className="h-10 w-10 text-muted-foreground/20" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[14px] font-medium text-foreground">Clean State</span>
                <span className="text-[11px] text-muted-foreground/40">No critical issues flagged by Greptile</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="flex min-h-[360px] flex-col border border-border bg-card p-8 group transition-all hover:border-white/10"
          >
            <div className="mb-10 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
                <ListChecks className="h-4 w-4 opacity-50 transition-colors group-hover:text-foreground group-hover:opacity-100" />
                Synthesis Report
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(0,255,0,0.5)]" />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
              <div className="flex h-20 w-20 items-center justify-center border border-border bg-muted/10">
                <Box className="h-10 w-10 text-muted-foreground/20" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[14px] font-medium text-foreground">Processing...</span>
                <span className="text-[11px] text-muted-foreground/40">Aggregating weekly performance metrics</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
