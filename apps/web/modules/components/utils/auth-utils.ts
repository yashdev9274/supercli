"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export const requireAuth = async (loginPath = "/login") => {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const session = await auth.api.getSession({
                headers: await headers()
            })

            if (!session) {
                redirect(loginPath)
            }

            return session
        } catch (error) {
            lastError = error
            if (attempt === 0) {
                await new Promise(r => setTimeout(r, 500))
            }
        }
    }
    void lastError
    redirect(loginPath)
}

export const requireUnAuth = async (authenticatedPath = "/") =>{
    const session = await auth.api.getSession({
        headers:await headers()
    })

    if(session){
        redirect(authenticatedPath)
    }

    return session
}
