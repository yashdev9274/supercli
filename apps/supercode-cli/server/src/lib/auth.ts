
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { deviceAuthorization } from "better-auth/plugins"
import prisma from "./prisma"

const serverUrl = process.env.BETTER_AUTH_URL || "http://localhost:3004"
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
const isProduction = serverUrl.startsWith("https://")

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: serverUrl,
  basePath: "/api/auth",
  trustedOrigins: [clientUrl, serverUrl],
  account: {
    skipStateCookieCheck: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      ...(isProduction
        ? {
            redirectURI:
              "https://supercode-terminal.vercel.app/api/auth/callback/github",
          }
        : {}),
    },
  },
  plugins: [
    deviceAuthorization({
      schema: {},
      expiresIn: "10m",
      interval: "5s",
      verificationUri: `${clientUrl}/device`,
    }),
  ],
})