
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { deviceAuthorization } from "better-auth/plugins"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || "",
})

const prisma = new PrismaClient({ adapter })

const serverUrl = process.env.BETTER_AUTH_URL || "http://localhost:3004"
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: serverUrl,
  basePath: "/api/auth",
  trustedOrigins: [clientUrl, serverUrl],
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