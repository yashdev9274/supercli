import prisma from "@super/db"
import { createSessionCookieForUser } from "@super/auth/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import { harnessTokenCookieHeader } from "@/modules/nova/harness/auth"

const callbackQuerySchema = z.object({
  token: z.string().min(1).max(512),
  redirect: z.literal("/app").default("/app"),
})

const cliSessionSchema = z.object({
  session: z.object({
    token: z.string().min(1),
    expiresAt: z.union([z.string(), z.date()]).optional(),
  }).optional(),
  user: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
  }),
})

function getTerminalServerUrl(): string {
  return process.env.SUPERCODE_TERMINAL_API_URL
    ?? process.env.TERMINAL_SERVER_URL
    ?? (process.env.NODE_ENV === "production"
      ? "https://supercode-8w7e.onrender.com"
      : "http://localhost:3004")
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  )
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url)
  const query = callbackQuerySchema.safeParse({
    token: url.searchParams.get("token"),
    redirect: url.searchParams.get("redirect") ?? undefined,
  })

  if (!query.success) {
    return errorResponse("Invalid or missing login token", 400)
  }

  let cliResponse: Response
  try {
    cliResponse = await fetch(
      new URL("/api/auth/one-time-token/verify", getTerminalServerUrl()),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: query.data.token }),
        cache: "no-store",
      },
    )
  } catch {
    return errorResponse("The authentication service is unavailable", 502)
  }

  if (!cliResponse.ok) {
    return errorResponse("The login token is invalid, expired, or already used", 401)
  }

  const cliSession = cliSessionSchema.safeParse(await cliResponse.json())
  if (!cliSession.success) {
    return errorResponse("The authentication service returned an invalid session", 502)
  }

  const cliUser = cliSession.data.user
  const email = cliUser.email.trim().toLowerCase()
  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: { id: true },
  })
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: cliUser.name,
          email,
          emailVerified: cliUser.emailVerified,
          image: cliUser.image ?? null,
        },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: cliUser.name,
          email,
          emailVerified: cliUser.emailVerified,
          image: cliUser.image ?? null,
        },
        select: { id: true },
      })

  const forwardedFor = request.headers.get("x-forwarded-for")
  const sessionCookie = await createSessionCookieForUser(user.id, {
    ipAddress: forwardedFor?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })
  const response = NextResponse.redirect(new URL(query.data.redirect, request.url))
  response.headers.append("Set-Cookie", sessionCookie)

  // Keep the CLI/harness session token so Nova web can call /api/ai/chat
  // the same way Supercode Desktop does (Bearer auth on the terminal server).
  const harnessToken = cliSession.data.session?.token
  if (harnessToken) {
    response.headers.append("Set-Cookie", harnessTokenCookieHeader(harnessToken))
  }

  response.headers.set("Cache-Control", "no-store")
  return response
}
