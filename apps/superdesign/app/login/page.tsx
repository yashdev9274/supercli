import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { LoginButton } from "./login-button"

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session) {
    redirect("/projects")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-8 p-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Superdesign</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            AI-powered design workspace
          </p>
        </div>
        <LoginButton />
      </div>
    </div>
  )
}
