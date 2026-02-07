"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export const requireAuth = async () =>{
    const session = await auth.api.getSession({
        headers:await headers()
    })

    if(!session){
        redirect("/login")
    }

    return session
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
