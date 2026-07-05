import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"

export async function requireAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/login")
  }

  return session
}

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

export async function requireApiAuth() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  return { session }
}
