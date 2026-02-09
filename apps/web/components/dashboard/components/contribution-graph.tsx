import React from "react"; 
import {ActivityCalendar} from "react-activity-calendar";
import {useTheme} from "next-themes";
import {useQuery} from "@tanstack/react-query";
import { getContributionStats } from "@/modules/dashboard/actions";
// import {getContributionStats} from "@/modules/dashboard/actions";

export function ContributionGraph() {

    const {theme} = useTheme();

    const {data, isLoading} = useQuery({
        queryKey: ['contribution-graph'],
        queryFn: async()=>await getContributionStats(),
        staleTime: 1000*60*5
    })

    if(isLoading){
        return(
            <div>
                <div>
                    Loading contribution graph...
                </div>
            </div>
        )
    }

    if(!data || !data.contributions.length){
        return(
            <div>
                <div>
                    No Contribution data available
                </div>
            </div>
        )
    }

    return(
        <div className='w-full flex flex-col items-center gap-4 p-4'>
            <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{data.totalContributions}</span>
                contributions in the last year
            </div>

            <div className='w-full overflow-x-auto'>
                <div className='flex justify-center min-w-max px-4'>
                <ActivityCalendar
                    data={data.contributions}
                    colorScheme={theme==="dark"?"dark":"light"}
                    blockSize={11}
                    blockMargin={4}
                    fontSize={14}
                    showMonthLabels
                    showWeekdayLabels
                    theme={{
                        light: ['#ebedf0', '#f97316'],
                        dark: ['#1d1b22', '#f97316']
                    }}
                />
                </div>
            </div>
        </div>

    )
}

