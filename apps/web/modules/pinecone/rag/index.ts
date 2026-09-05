import { createHash } from "node:crypto"
import { pineconeIndex } from "@/lib/pinecone/pinecone"
import { embeddingModel } from "@/lib/gateway"
import { embed } from "ai"

// Pinecone metadata values must stay under ~40KB; keep content snippets small.
const MAX_EMBED_CHARS = 8000
const MAX_METADATA_CONTENT_CHARS = 3500
const EMBED_CONCURRENCY = 5
const UPSERT_BATCH_SIZE = 50

function vectorId(repoId: string, path: string): string {
  // Pinecone IDs max 512 chars — hash long paths to stay safe/unique
  const raw = `${repoId}:${path}`
  if (raw.length <= 480) {
    return raw.replace(/[^a-zA-Z0-9:_./-]/g, "_")
  }
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 32)
  return `${repoId.slice(0, 80)}:${hash}`
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel("openai/text-embedding-3-small"),
    value: text,
  })
  return embedding as number[]
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const current = next++
      results[current] = await fn(items[current], current)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export async function indexCodebase(
  repoId: string,
  files: { path: string; content: string }[],
) {
  console.log(
    "[DEBUG-PINECONE] Starting indexCodebase for repo:",
    repoId,
    "with",
    files.length,
    "files",
  )

  const usable = files.filter((file) => file.content?.trim())

  const vectors = (
    await mapPool(usable, EMBED_CONCURRENCY, async (file) => {
      const content = `File: ${file.path}\n\n${file.content}`
      const truncatedContent = content.slice(0, MAX_EMBED_CHARS)

      try {
        const embedding = await generateEmbedding(truncatedContent)

        return {
          id: vectorId(repoId, file.path),
          values: embedding,
          metadata: {
            repoId,
            path: file.path,
            // Keep metadata small — full file is not needed at query time
            content: truncatedContent.slice(0, MAX_METADATA_CONTENT_CHARS),
          },
        }
      } catch (error) {
        console.error(`[DEBUG-PINECONE] Failed to embed ${file.path}:`, error)
        return null
      }
    })
  ).filter((v): v is NonNullable<typeof v> => v !== null)

  console.log("[DEBUG-PINECONE] Total vectors created:", vectors.length)

  if (vectors.length === 0) {
    console.log("[DEBUG-PINECONE] No vectors to upsert!")
    return 0
  }

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE)
    console.log("[DEBUG-PINECONE] Upserting batch of", batch.length, "vectors")
    try {
      await pineconeIndex.upsert({ records: batch })
    } catch (error) {
      console.error(
        `[DEBUG-PINECONE] Upsert failed for batch starting at ${i}:`,
        error,
      )
      throw error
    }
  }

  console.log("[DEBUG-PINECONE] Upserted all batches successfully")
  return vectors.length
}

export async function retrieveContext(
  query: string,
  repoId: string,
  topK: number = 5,
) {
  const embedding = await generateEmbedding(query)

  const results = await pineconeIndex.query({
    vector: embedding,
    filter: { repoId: { $eq: repoId } },
    topK,
    includeMetadata: true,
  })

  return results.matches
    .map((match) => (match.metadata?.content as string) || "")
    .filter(Boolean)
}
