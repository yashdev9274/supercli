import { PrismaPg } from "@prisma/adapter-pg"
import { Prisma, PrismaClient } from "./generated"

const prismaClientSingleton = () => new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// Next.js preserves globals across hot reloads, including clients generated
// before a schema change. Only reuse a client for the same generated schema.
const schemaSignature = JSON.stringify(Prisma.dmmf.datamodel)

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined
  prismaSchemaSignature: string | undefined
} & typeof global

const cached = globalThis.prismaGlobal
const reuseCached = process.env.NODE_ENV !== "production"
  && globalThis.prismaSchemaSignature === schemaSignature
const prisma = reuseCached && cached ? cached : prismaClientSingleton()

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma
  globalThis.prismaSchemaSignature = schemaSignature
  if (cached && cached !== prisma) {
    void cached.$disconnect().catch(() => undefined)
  }
}

export default prisma
