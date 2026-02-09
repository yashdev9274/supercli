
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



function PRsCard() {

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
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-none border border-border bg-card p-6 transition-all duration-300 hover:border-white/10",
          
        )}
      >
        <div className="relative mb-6 flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center text-foreground/70 transition-colors group-hover:text-foreground/90">
            {<Clock />}
          </div>
          <span className="text-[10px] font-bold tracking-[0.15em] text-foreground/80 uppercase">
            PRs
          </span>
        </div>
        
        
          <div className="relative flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
            
            <div className="text-2xl font-bold text-foreground">{isLoading ? "...": (stats?.totalPRs || 0) }</div>
            <span className="max-w-[180px] text-[11px] font-medium leading-relaxed text-foreground/70">
              
            </span>
          </div>
        
  
        
          <div className="mt-auto flex items-center gap-1.5 text-[10px] font-medium text-foreground/60 group-hover:text-foreground/80 transition-colors">
            <Activity className="h-3 w-3" />
            <span>Syncing live data</span>
          </div>
        
      </motion.div>
    );
  }

export default PRsCard