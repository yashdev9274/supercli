"use server";

import { getRepositories } from "@/modules/github/lib/github"
import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { headers } from "next/headers"

export const fetchRepositories = async(page:number=1 , perPage:number = 10)=>{
    const session = await auth.api.getSession({
      headers: await headers()
    })
  
    if (!session) {
      throw new Error("Unauthorized")
    }
  
    const githubRepos = await getRepositories(page , perPage)
  
    const dbRepos = await prisma.repository.findMany({
        where:{
            userId: session.user.id
        }
    })

    const connectedRepoIds = new Set(dbRepos.map(repo=>repo.githubId))

    return githubRepos.map((repo:any)=>({
        ...repo,
        isConnected:connectedRepoIds.has(BigInt(repo.id))
    }))
}