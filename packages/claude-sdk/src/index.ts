import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export async function generateClaudeReview(prompt: string): Promise<string> {
    console.log("[DEBUG-CLAUDE-SDK] generateClaudeReview called")
    
    const { text } = await generateText({
        model: anthropic("claude-3-sonnet-20240229") as any,
        prompt
    })
    
    console.log("[DEBUG-CLAUDE-SDK] generateClaudeReview completed, length:", text?.length || 0)
    return text
}
