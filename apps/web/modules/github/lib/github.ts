import {Octokit} from "octokit"
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";

export const getGithubToken = async()=>{
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if(!session){
        throw new Error("Unauthorized")
    }

    const account = await prisma.account.findFirst({
        where:{
            userId: session.user.id,
            providerId: "github"
        }
    })

    if(!account?.accessToken){
        throw new Error("No github access token found")
    }

    return account.accessToken;
}

export async function fetchUserContribution(token: string, username: string){
    const octokit = new Octokit({auth: token})

    const query =`
    query($username:String!){
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                color
              }
            }
          }
        }
      }
    }
    `

    // interface contributindata{
    //     user:{
    //         contributionCollection:{
    //             contributionCalendar:{
    //                 totalContributions:number,
    //                 weeks:{
    //                     contributionCount:number,
    //                     data:string | Date,
    //                 }
    //             }
    //         }
    //     }
    // }

    try {
        const response: any = await octokit.graphql(query, {
            username,
        })

        return response.user.contributionsCollection.contributionCalendar
    } catch (error) {
        console.error("Error in fetching contributions:", error)
        return null
    }

  }
  
export const getRepositories = async(page: number=1, per_page=10)=>{

  const token = await getGithubToken();
  const octokit = new Octokit({auth:token})

  const {data} = await octokit.rest.repos.listForAuthenticatedUser({
    per_page,
    page,
    sort: "updated",
    direction: "desc"
  })

  return data
}


export const createWebhook = async(owner:string, repo:string)=>{
  const token = await getGithubToken()

  const octokit = new Octokit({auth:token})

  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.replace(/\/$/, '')
  const webhookUrl = `${baseUrl}/api/webhooks/github`

  const{data:hooks} = await octokit.rest.repos.listWebhooks({
    owner,
    repo
  })

  // check any existing webhook

  const existingHook = hooks.find(hook => {
    const hookUrl = hook.config?.url
    if (!hookUrl) return false
    // Normalize both URLs for comparison (remove trailing slashes)
    const normalizedHookUrl = hookUrl.replace(/\/$/, '')
    const normalizedWebhookUrl = webhookUrl.replace(/\/$/, '')
    return normalizedHookUrl === normalizedWebhookUrl
  })

  if(existingHook){
    return existingHook
  }


  // creating webhook

  const {data} = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config:{
      url:webhookUrl,
      content_type:"json"
    },
    events:["pull_request"]
  })

  return data

}

export const deleteWebhook = async (owner:string, repo:string)=>{
  const token = await getGithubToken()

  const octokit = new Octokit({auth:token})

  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.replace(/\/$/, '')
  const webhookUrl = `${baseUrl}/api/webhooks/github`

  try {
    
    const{data: hooks} = await octokit.rest.repos.listWebhooks({
      owner,
      repo
    })

    const hookToDelete = hooks.find(hook => hook.config.url === webhookUrl)

    if(hookToDelete){
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id:hookToDelete.id
      })
      return true
    }
    return false

  } catch (error) {
   console.error("Error in deleting webhook:", error)
   return false 
  }

}