import { inngest } from "../client"
import {
  getGithubTokenForUser,
  getRepoFileContentsByPaths,
  listRepoFilePaths,
} from "@/modules/github/lib/github"
import { indexCodebase } from "@/modules/pinecone/rag"

// Keep each index step small enough for Inngest step output limits + serverless timeouts.
const INDEX_BATCH_SIZE = 40

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    await step.sleep("wait-a-moment", "1s")
    return { message: `Hello ${event.data.email}!` }
  },
)

export const indexRepo = inngest.createFunction(
  {
    id: "index-repo",
    // Long-running indexing; retries help with transient GitHub/embedding/Pinecone errors
    retries: 2,
  },
  { event: "repository-connected" },

  async ({ event, step }) => {
    const { owner, repo, userId } = event.data
    const repoId = `${owner}/${repo}`

    // Step 1: resolve GitHub token + list paths only (small step output)
    const paths = await step.run("list-file-paths", async () => {
      console.log("[DEBUG] Listing file paths for", owner, repo)

      const accessToken = await getGithubTokenForUser(userId)
      const filePaths = await listRepoFilePaths(accessToken, owner, repo)
      console.log("[DEBUG] Indexable file paths:", filePaths.length)
      return filePaths
    })

    // Step 2+: fetch + embed + upsert in batches so step outputs stay small
    // and individual steps finish within serverless time limits.
    let indexedTotal = 0
    const batchCount = Math.ceil(paths.length / INDEX_BATCH_SIZE)

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
      const batchPaths = paths.slice(
        batchIndex * INDEX_BATCH_SIZE,
        (batchIndex + 1) * INDEX_BATCH_SIZE,
      )

      const batchIndexed = await step.run(
        `index-batch-${batchIndex}`,
        async () => {
          console.log(
            `[DEBUG] Indexing batch ${batchIndex + 1}/${batchCount} (${batchPaths.length} files)`,
          )

          const accessToken = await getGithubTokenForUser(userId)
          const files = await getRepoFileContentsByPaths(
            accessToken,
            owner,
            repo,
            batchPaths,
          )

          console.log(
            `[DEBUG] Fetched ${files.length}/${batchPaths.length} files for batch ${batchIndex}`,
          )

          const count = await indexCodebase(repoId, files)
          console.log(`[DEBUG] Batch ${batchIndex} indexed:`, count)
          return count
        },
      )

      indexedTotal += batchIndexed
    }

    return {
      success: true,
      pathCount: paths.length,
      indexedFiles: indexedTotal,
      batches: batchCount,
    }
  },
)
