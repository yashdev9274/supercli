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
        staleTime: 1000*6*5
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
    return(
        <div>
            <h1>Contribution Graph</h1>
        </div>
    )
}

