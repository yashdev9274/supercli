import { NextResponse } from "next/server"
import prisma from "@super/db"
import { z } from "zod"

import { sendNovaEarlyInviteConfirmation } from "@/modules/email/nova-early-invite"

const novaInviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  role: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  website: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const parsed = novaInviteSchema.safeParse(payload)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a valid name, role, and work email." },
        { status: 400 },
      )
    }

    const { name, role, email, website } = parsed.data
    if (website) {
      return NextResponse.json({ message: "You’re on Nova’s early invite list." })
    }

    const existing = await prisma.novaEarlyInvite.findUnique({
      where: { email },
      select: { id: true, emailStatus: true },
    })

    if (existing) {
      return NextResponse.json({
        message: "You’re already on Nova’s early invite list.",
      })
    }

    const invite = await prisma.novaEarlyInvite.create({
      data: { name, role, email },
      select: { id: true },
    })

    const delivery = await sendNovaEarlyInviteConfirmation({
      inviteId: invite.id,
      name,
      email,
    })

    await prisma.novaEarlyInvite.update({
      where: { id: invite.id },
      data: delivery.sent
        ? {
            emailStatus: "sent",
            resendEmailId: delivery.emailId,
            emailSentAt: new Date(),
          }
        : { emailStatus: "failed" },
    })

    return NextResponse.json({
      message: delivery.sent
        ? "You’re in. Check your inbox for Nova’s confirmation."
        : "You’re on Nova’s early invite list. We’ll be in touch.",
    })
  } catch (error) {
    console.error("[nova-early-invite] signup failed:", error)
    return NextResponse.json(
      { error: "We couldn’t add you right now. Please try again." },
      { status: 500 },
    )
  }
}
