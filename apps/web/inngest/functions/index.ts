import prisma from "@super/db";
import { inngest } from "../client";
import { getRepoFileContents } from "@/modules/github/lib/github";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data.email}!` };
  },
);

export const indexRepo = inngest.createFunction(
  {id: "index-repo"},
  {event: "repository-connected"},

  async ({event, step})=>{
    const{owner, repo, userId} = event.data
  
    const files = await step.run("fetch-files", async()=>{
      const account = await prisma.account.findFirst({
        where:{
          userId:userId,
          providerId:"github"
        }
      })

      if(!account?.accessToken){
        throw new Error("No github access token found");
      }

      return await getRepoFileContents(account.accessToken, owner, repo)
    })

    await step.run("index-codebase", async()=>{
      
    })
  }
)