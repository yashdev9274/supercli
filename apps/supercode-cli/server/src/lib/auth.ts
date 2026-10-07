
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { deviceAuthorization, oneTimeToken } from "better-auth/plugins"
import prisma from "./prisma"

const serverUrl = process.env.BETTER_AUTH_URL || "http://localhost:3004"
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
const isProduction = serverUrl.startsWith("https://")
const novaOrigins = [
  "https://nova.supercodeai.tech",
  "http://nova.localhost:3003",
]

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: serverUrl,
  basePath: "/api/auth",
  trustedOrigins: [clientUrl, serverUrl, ...novaOrigins],
  account: {
    skipStateCookieCheck: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      ...(process.env.GITHUB_REDIRECT_URI
        ? { redirectURI: process.env.GITHUB_REDIRECT_URI }
        : isProduction
          ? {
              redirectURI:
                "https://supercode-terminal.vercel.app/api/auth/callback/github",
            }
          : {}),
    },
  },
  plugins: [
    oneTimeToken({
      expiresIn: 3,
      storeToken: "hashed",
    }),
    deviceAuthorization({
      schema: {},
      expiresIn: "10m",
      interval: "5s",
      verificationUri: `${clientUrl}/device`,
    }),
  ],
})