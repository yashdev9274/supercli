"use server"

import { auth } from "@/lib/auth";
import { fetchUserContribution, getGithubToken } from "@/modules/github/lib/github";
import { headers } from "next/headers";
import { Octokit } from "octokit";

export async function getDashboardStats() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})
        
        // to get users github username

        const {data: user} = await octokit.rest.users.getAuthenticated()

        const totalRepos= 5

        const calendar = await fetchUserContribution(token, user.login)
        const totalCommits = calendar?.totalContributions || 0

        const {data:prs} = await octokit.rest.search.issuesAndPullRequests({
            q: `author:${user.login} type:pr`,
            per_page:1 
        })

        const totalPRs = prs.total_count

        const toatalReviews = 50

        return{
            totalCommits,
            totalPRs,
            toatalReviews,
            totalRepos
        }

    } catch (error) {
        console.error("Error in fetching dashbaord stats: ", error);
        return{
            totalCommits:0,
            totalPRs:0,
            toatalReviews : 0, 
            totalRepos :0,
        }
        
    }
}

export async function getMontlyActivity(){
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})

        const {data: user} = await octokit.rest.users.getAuthenticated()

        const calendar = await fetchUserContribution(token, user.login)

        if(!calendar){
            return []
        }

        const monthlyData:{
            [key:string] : {commits: number; prs: number; reviews: number}
        }={}

        const monthNames=[
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ]

        const present = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(present.getFullYear(), present.getMonth() - i, 1);
            const monthKey = monthNames[date.getMonth()];
            monthlyData[monthKey] = { commits: 0, prs: 0, reviews: 0 };
          }
          
          calendar.weeks.forEach((week: any) => {
            week.contributionDays.forEach((day: any) => {
              const date = new Date(day.date);
              const monthKey = monthNames[date.getMonth()];
              if (monthlyData[monthKey]) {
                monthlyData[monthKey].commits += day.contributionCount;
              }
            })
          })

          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6)
          

          const generateSampleReviews = () => {
            const sampleReviews = [];
            const now = new Date();
          
            // Generate random reviews over the past 6 months
            for (let i = 0; i < 45; i++) {
              const randomDaysAgo = Math.floor(Math.random() * 180); // Random day in last 6 months
              const reviewDate = new Date(now);
              reviewDate.setDate(reviewDate.getDate() - randomDaysAgo);
          
              sampleReviews.push({
                createdAt: reviewDate,
              });
            }
          
            return sampleReviews;
          }

    const reviews = generateSampleReviews()

    reviews.forEach((review)=>{
        const monthKey = monthNames[review.createdAt.getMonth()];
        if(monthlyData[monthKey]){
            monthlyData[monthKey].reviews+=1
        }
    })

    const {data:prs} = await octokit.rest.search.issuesAndPullRequests({
        q: `author:${user.login} type:pr created: >${
            sixMonthsAgo.toISOString().split("T")[0]
        }`,
        per_page:100
    })

    prs.items.forEach((pr: any)=>{
        const date = new Date(pr.created_at)
        const monthKey = monthNames[date.getMonth()]
        if(monthlyData[monthKey]){
            monthlyData[monthKey].prs+=1
        }
    })

    return Object.keys(monthlyData).map((name) => ({
        name,
        ...monthlyData[name]
    }));
          
    } catch (error) {
        console.log("Error in fetching montly activity:", error)
        return [];
        
    }
}


export async function getContributionStats(){
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})

        const {data: user} = await octokit.rest.users.getAuthenticated()
        const username = user.login
        const calendar = await fetchUserContribution(token, username)

        if(!calendar){
            return null
        }

        // First flatten raw contributions so we can compute levels relative to the max count.
        const rawContributions: { date: string; count: number }[] =
            calendar.weeks.flatMap((week: any) =>
                week.contributionDays.map((day: any) => ({
                    date: day.date,
                    count: day.contributionCount,
                }))
            )

        const maxCount = rawContributions.reduce(
            (max: number, day) => (day.count > max ? day.count : max),
            0
        )

        // Map counts to levels 0–4 (what react-activity-calendar expects).
        const contributions = rawContributions.map((day) => {
            if (day.count === 0 || maxCount === 0) {
                return { ...day, level: 0 }
            }

            const ratio = day.count / maxCount
            let level = 1

            if (ratio > 0.75) level = 4
            else if (ratio > 0.5) level = 3
            else if (ratio > 0.25) level = 2

            return { ...day, level }
        })

        return{
            contributions,
            totalContributions: calendar.totalContributions
        }

    } catch (error) {
        console.error("Error in fetching user contribution stats:", error);
        return null;
    }
}
