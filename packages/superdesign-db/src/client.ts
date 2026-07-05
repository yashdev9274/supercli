import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../prisma/client"

let _prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (_prisma) return _prisma

  const connectionString =
    process.env.DATABASE_URL_TERMINAL || process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_TERMINAL or DATABASE_URL environment variable is required"
    )
  }

  const adapter = new PrismaPg({ connectionString })
  _prisma = new PrismaClient({ adapter })
  return _prisma
}

export default getPrisma
