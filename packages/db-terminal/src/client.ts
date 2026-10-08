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

/**
 * Lazy client so Next.js can import modules that re-export harness helpers
 * during `collect page data` without requiring DATABASE_URL_TERMINAL at
 * module-evaluation time. The URL is still required on first real query.
 */
function getPrisma(): ReturnType<typeof prismaClientSingleton> {
  if (!globalThis.prismaTerminalGlobal) {
    globalThis.prismaTerminalGlobal = prismaClientSingleton()
  }
  return globalThis.prismaTerminalGlobal
}

const prisma = new Proxy({} as ReturnType<typeof prismaClientSingleton>, {
  get(_target, property, receiver) {
    const client = getPrisma()
    const value = Reflect.get(client, property, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
})

export default prisma
export { PrismaClient, getPrisma as getTerminalPrisma }
