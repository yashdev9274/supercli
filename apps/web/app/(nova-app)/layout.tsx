import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Nova | Supercode",
  description: "Work with Nova, your Supercode engineering agent.",
}

export default function NovaAppLayout({ children }: { children: ReactNode }) {
  return children
}
