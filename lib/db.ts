import { PrismaClient } from "./generated/prisma/client";
import {PrismaPg} from "@prisma/adapter-pg";


const adapter = new PrismaPg({
    connectionString:process.env.DATABASE_URL
})

// Windsurf: Refactor | Explain | Generate JSDoc | ×
const prismaClientSingleton = ()=>{
    return new PrismaClient({adapter})
}

declare const globalThis: {
    prismaGlobal:ReturnType<typeof prismaClientSingleton>;
} & typeof global;


const prisma = globalThis.prismaGlobal || prismaClientSingleton();

if(process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma;