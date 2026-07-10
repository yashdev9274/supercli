"use client"

import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Github } from "lucide-react"

export function LoginButton() {
  return (
    <Button
      variant="primary"
      size="lg"
      onClick={() =>
        signIn.social({
          provider: "github",
          callbackURL: "/projects",
        })
      }
    >
      <Github className="w-4 h-4" />
      Sign in with GitHub
    </Button>
  )
}
