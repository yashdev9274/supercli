import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated"

function terminalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TERMINAL?.trim()
  if (!url) {
    throw new Error(
      "DATABASE_URL_TERMINAL is required for the terminal/harness database. "
        + "It must not fall back to the dashboard DATABASE_URL.",
    )
  }
  return url
}

const prismaClientSingleton = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: terminalDatabaseUrl(),
    }),
  })

// IMPORTANT: do not share globalThis.prismaGlobal with @super/db — that
// silently points harness sessions at the dashboard database and /api/ai/chat 401s.
declare const globalThis: {
  prismaTerminalGlobal: ReturnType<typeof prismaClientSingleton> | undefined
} & typeof global

const prisma = globalThis.prismaTerminalGlobal ?? prismaClientSingleton()

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaTerminalGlobal = prisma
}

export default prisma
export { PrismaClient }
