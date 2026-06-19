import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import prisma from "@super/db-terminal"
import { sendWaitlistConfirmation, sendWaitlistNotification } from "@/lib/email"

const schema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
    }

    const { email, name } = parsed.data

    const existing = await prisma.waitlistEntry.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ message: "Already on the waitlist" })
    }

    await prisma.waitlistEntry.create({
      data: { email, name: name ?? null, source: "web" },
    })

    sendWaitlistConfirmation(email, name).catch(() => {})
    sendWaitlistNotification(email, name).catch(() => {})

    return NextResponse.json({ message: "You're on the list!" })
  } catch (err) {
    console.error("waitlist error:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
