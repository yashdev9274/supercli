
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { deviceAuthorization } from "better-auth/plugins"
import prisma from "@super/db-terminal"

const serverUrl = process.env.BETTER_AUTH_URL || "http://localhost:3004"
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"

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