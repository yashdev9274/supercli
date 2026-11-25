export function canConsultSpecialist(principal: { authenticator: string; issuer?: string; principalType: string; attributes: Record<string, unknown> } | null, delegated: boolean, env: Record<string, string | undefined>): boolean {
  return !delegated && principal?.authenticator === "nova-scope" && principal.issuer === "nova" && principal.principalType === "user"
    && typeof principal.attributes.repositoryRunId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(principal.attributes.repositoryRunId)
    && env.NOVA_EVE_SPECIALISTS_ENABLED === "true" && env.NOVA_EVE_REPOSITORY_ENABLED === "true"
}
