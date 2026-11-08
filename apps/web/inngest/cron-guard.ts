/**
 * Local/dev with cloud Inngest keys was firing Nova maintenance crons every
 * minute (reconcile runs, approvals, activity delivery, automation schedule).
 * That is unrelated to nova-feedback capture (which only runs inside a user
 * session turn).
 *
 * Enable maintenance crons only when explicitly on, or in production.
 * Set `NOVA_MAINTENANCE_CRONS=on` to force-enable locally.
 * Set `NOVA_MAINTENANCE_CRONS=off` to force-disable in production.
 */
export function novaMaintenanceCronsEnabled(): boolean {
  const flag = (process.env.NOVA_MAINTENANCE_CRONS ?? "").trim().toLowerCase()
  if (flag === "off" || flag === "false" || flag === "0") return false
  if (flag === "on" || flag === "true" || flag === "1") return true
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
}

export function skipMaintenanceCron(reason = "maintenance_crons_disabled") {
  return { skipped: true as const, reason }
}
