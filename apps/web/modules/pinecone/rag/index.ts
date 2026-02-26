import { pineconeIndex } from '@/lib/pinecone/pinecone';
import { google } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embed } from 'ai';

export async function generateEmbedding(text: string): Promise<number[]> {
    console.log("[DEBUG-PINECONE] generateEmbedding called, text length:", text.length)
    
    const google = createGoogleGenerativeAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    });

    const { embedding } = await embed({
        model: google.textEmbeddingModel("gemini-embedding-001") as any,
        value: text
    })
    console.log("[DEBUG-PINECONE] generateEmbedding completed, embedding length:", embedding.length)
    return embedding as number[]
}

export async function indexCodebase(repoId: string, files: {path:string, content: string}[]){
    
    console.log("[DEBUG-PINECONE] Starting indexCodebase for repo:", repoId, "with", files.length, "files")
    
    const vectors = []
    
    for(const file of files){
        if(!file.content || file.content.trim() === "") {
            console.log("[DEBUG-PINECONE] Skipping empty file:", file.path)
            continue;
        }
        const content = `Files: ${file.path}\n\n${file.content}`;

        const truncatedContent = content.slice(0,8000)

        try {
            console.log("[DEBUG-PINECONE] Generating embedding for:", file.path)
            const embedding = await generateEmbedding(truncatedContent)
            console.log("[DEBUG-PINECONE] Generated embedding for:", file.path, "embedding length:", embedding.length)

            vectors.push({
                id: `${repoId}-${file.path.replace(/\//g, '_')}`,
                values: embedding,
                metadata: {
                    repoId,
                    path:file.path,
                    content:truncatedContent
                }
            })
        } catch (error) {
            console.error(`[DEBUG-PINECONE] Failed to embed ${file.path}:`, error)
        }

    }

    console.log("[DEBUG-PINECONE] Total vectors created:", vectors.length)
    
    if(vectors.length>0){
        
        const batchSize = 100;

        for(let i=0; i<vectors.length; i+=batchSize){
            const batch = vectors.slice(i, i+batchSize)
            console.log("[DEBUG-PINECONE] Upserting batch of", batch.length, "vectors")
            await pineconeIndex.upsert({ records: batch })
            console.log("[DEBUG-PINECONE] Upserted batch successfully")
        }
    } else {
        console.log("[DEBUG-PINECONE] No vectors to upsert!")
    }

    return vectors.length;
}

export async function retrieveContext(query: string, repoId: string, topK:number=2){

    const embedding = await generateEmbedding(query);

    const results = await pineconeIndex.query({
        vector: embedding,
        filter: {repoId},
        topK,
        includeMetadata:true
    })

    return results.matches.map(match=>(match.metadata?.content as string || "").slice(0,2000)).filter(Boolean)

}