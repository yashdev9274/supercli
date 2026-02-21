import { pineconeIndex } from '@/lib/pinecone/pinecone';
import { google } from '@ai-sdk/google';
import { embed } from 'ai';

export async function generateEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({
        model: google.textEmbeddingModel("text-embedding-004") as any,
        value: text
    })
    return embedding as number[]
}

export async function indexCodebase(repoId: string, files: {path:string, content: string}[]){
    
    const vectors = []
    
    for(const file of files){
        const content = `Files: ${file.path}\n\n${file.content}`;

        const truncatedContent = content.slice(0,8000)

        try {
            const embedding = await generateEmbedding(truncatedContent)

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
            console.error(`Failed to embed ${file.path}:`, error)
        }

    }

    if(vectors.length>0){
        
        const batchSize = 100;

        for(let i=0; i<vectors.length; i+=batchSize){
            const batch = vectors.slice(i, i+batchSize)

            await pineconeIndex.upsert({ records: batch })
        }
    }

    console.log("File indexed")
}