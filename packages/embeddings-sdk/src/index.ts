import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embed } from 'ai';

export async function generateEmbedding(text: string): Promise<number[]> {
    console.log("[DEBUG-EMBEDDINGS-SDK] generateEmbedding called, text length:", text.length)
    
    const google = createGoogleGenerativeAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    });

    const { embedding } = await embed({
        model: google.textEmbeddingModel("gemini-embedding-001"),
        value: text
    })
    console.log("[DEBUG-EMBEDDINGS-SDK] generateEmbedding completed, embedding length:", embedding.length)
    return embedding as number[]
}
