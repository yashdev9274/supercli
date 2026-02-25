'use server'

import { inngest } from "@/inngest/client"
import { getPullRequestDiff } from "@/modules/github/lib/github"
import prisma from "@super/db"
import { Octokit } from "octokit"

export async function reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
){
    
    try {
        
        const repository = await prisma.repository.findFirst({
            
            where:{
                owner,
                name: repo
            },
            include:{
                user:{
                    include:{
                        accounts:{
                            where:{
                                providerId:"github"
                            }
                        }
                    }
                }
            }
        })
        
        if(!repository){
            throw new Error(`Repository ${owner}/${repo} not found in database. Please reconnet the repository.`)
        }

        const githubAccount = repository.user.accounts[0];

        if(!githubAccount?.accessToken){
            throw new Error("No github access token found for the respective repository owner.")
        }

        const token = githubAccount.accessToken

        const {title} = await getPullRequestDiff(token, owner, repo, prNumber)

        await inngest.send({
            name:"pr.review.requested",
            data:{
                owner,
                repo,
                prNumber,
                userId:repository.user.id
            }
        })
        
        return{success:true, message: "Review Queued"}

    } catch (error) {
        
        try {
            
            const repository=await prisma.repository.findFirst({
                where:{owner,name: repo}
            })

            if(repository){

                await prisma.review.create({
                    data:{
                        repositoryId:repository.id,
                        prNumber,
                        prTitle: "Failed to fetch PR",
                        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
                        review: `Error: ${error instanceof Error ? error.message: "Unknown Error"}`,
                        status: "failed"
                    }
                })
            }


        } catch (dbError) {
            console.error("Failed to save error to database:",dbError)
        }
    }


}