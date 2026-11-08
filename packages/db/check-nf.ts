import { PrismaClient } from "./src/generated/client"
const p = new PrismaClient()
try {
  const t = await p.$queryRawUnsafe(
    `SELECT to_regclass('public.nova_feedback')::text as feedback, to_regclass('public.nova_feedback_event')::text as event`
  )
  console.log(JSON.stringify(t))
  const migrations = await p.$queryRawUnsafe(
    `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '%nova_feedback%' ORDER BY finished_at DESC NULLS LAST LIMIT 5`
  )
  console.log("migrations", JSON.stringify(migrations))
} catch (e) {
  console.error(String(e))
} finally {
  await p.$disconnect()
}
