import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TERMINAL,
});

const prismaClientSingleton = () => new PrismaClient({ adapter });

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
