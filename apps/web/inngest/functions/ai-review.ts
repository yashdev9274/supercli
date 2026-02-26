import prisma from "@super/db";
import { inngest } from "../client";
import { getPullRequestDiff, postReviewComment } from "@/modules/github/lib/github";
import { retrieveContext } from "@/modules/pinecone/rag";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export const generateReview = inngest.createFunction(

    {id: "generate-review", concurrency:5},
    {event: "pr.review.requested"},

    async({event, step})=>{
        const{owner, repo, prNumber, userId} = event?.data;

        const {diff, title, description, token} = await step.run("fetch-pr-data", async()=>{

            const account = await prisma.account.findFirst({
                where:{
                    userId: userId,
                    providerId: "github"
                }
            })

            if(!account?.accessToken){
                throw new Error("No github access token found")
            }

            const data = await getPullRequestDiff(account.accessToken, owner, repo, prNumber)
            return{...data, token:account.accessToken}

        })

        const context = await step.run("retrieve-context", async()=>{
            const query = `${title}\n${description}`;

            return await retrieveContext(query, `${owner}/${repo}`)
        })

        const review = await step.run("generate-ai-review", async()=>{
            const prompt = `You are an expert code reviewer. Analyze the following pull request and provide a detailed, constructive code review.
          
          PR Title: ${title}
          PR Description: ${description || "No description provided"}
          
          Context from Codebase:
          ${context.join("\n\n")}
          
          Code Changes:
          \`\`\`diff
          ${diff}
          \`\`\`
          
          Please provide:
          1. **Walkthrough**: A file-by-file explanation of the changes.
          2. **Sequence Diagram**: A Mermaid JS sequence diagram visualizing the flow of the changes (if applicable). Use \`\`\`mermaid ... \`\`\` block. **IMPORTANT**: Ensure the Mermaid syntax is valid. Do not use special characters (like quotes, braces, parentheses) inside Note text or labels as it breaks rendering. Keep the diagram simple.
          3. **Summary**: Brief overview.
          4. **Strengths**: What's done well.
          5. **Issues**: Bugs, security concerns, code smells.
          6. **Suggestions**: Specific code improvements.
          7. **Poem**: A short, creative poem summarizing the changes at the very end.
          
          Format your response in markdown.`;
        
          const{text} =  await generateText({
              model: google("gemini-3.1-pro-preview") as any,
              prompt
          })
          return text;
        })

        await step.run("post-comment", async()=>{
            await postReviewComment(token, owner, repo, prNumber, review)
        })


    }
)