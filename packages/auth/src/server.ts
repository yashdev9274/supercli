import prisma from "@super/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { serializeSignedCookie } from "better-call";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ["repo"],
    },
  },
});

type CreateSessionCookieOptions = {
  ipAddress?: string
  userAgent?: string
}

export async function createSessionCookieForUser(
  userId: string,
  options: CreateSessionCookieOptions = {},
): Promise<string> {
  const context = await auth.$context
  const session = await context.internalAdapter.createSession(userId, false, {
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  })

  if (!session) {
    throw new Error("Failed to create web session")
  }

  return serializeSignedCookie(
    context.authCookies.sessionToken.name,
    session.token,
    context.secret,
    {
      ...context.authCookies.sessionToken.attributes,
      maxAge: context.sessionConfig.expiresIn,
    },
  )
}
