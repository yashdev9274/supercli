import { auth } from "@/lib/auth";
import { getGithubToken } from "@/modules/github/lib/github";
import { headers } from "next/headers";
import { Octokit } from "octokit";

export async function getDashboardStats() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})
        
        // to get users github username
    } catch (error) {
        
    }
}