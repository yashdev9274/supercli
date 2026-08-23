"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export const requireAuth = async () => {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const session = await auth.api.getSession({
                headers: await headers()
            })

            if (!session) {
                redirect("/login")
            }

            return session
        } catch (error) {
            lastError = error
            if (attempt === 0) {
                await new Promise(r => setTimeout(r, 500))
            }
        }
    }
    redirect("/login")
}

export const requireUnAuth = async () =>{
    const session = await auth.api.getSession({
        headers:await headers()
    })

    if(session){
        redirect("/")
    }

    return session
}
