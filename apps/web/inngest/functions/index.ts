import prisma from "@super/db";
import { inngest } from "../client";
import { getRepoFileContents } from "@/modules/github/lib/github";
import { indexCodebase } from "@/modules/pinecone/rag";

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
      console.log("[DEBUG] Starting to fetch files for", owner, repo)
      const account = await prisma.account.findFirst({
        where:{
          userId:userId,
          providerId:"github"
        }
      })

      if(!account?.accessToken){
        throw new Error("No github access token found");
      }

      const files = await getRepoFileContents(account.accessToken, owner, repo)
      console.log("[DEBUG] Fetched files count:", files.length)
      console.log("[DEBUG] File paths:", files.map(f => f.path).join(", "))
      return files
    })

    const indexedCount = await step.run("index-codebase", async()=>{
      console.log("[DEBUG] Starting indexing for", owner, repo, "with", files.length, "files")
      const result = await indexCodebase(`${owner}/${repo}`, files)
      console.log("[DEBUG] Indexed count:", result)
      return result
    })

    return {success:true, indexedFiles: indexedCount}
  }
)