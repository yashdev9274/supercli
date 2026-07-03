export class MissingInfisicalTokenError extends Error {
  constructor(app: string) {
    super(
      [
        `No Infisical auth found for app "${app}".`,
        "",
        "  Run: infisical login",
        "",
        "Then retry. No .env fallback is available.",
      ].join("\n"),
    )
    this.name = "MissingInfisicalTokenError"
  }
}

export class SecretSchemaError extends Error {
  constructor(app: string, env: string, issues: string[]) {
    super(
      [
        `Secret schema validation failed for "${app}" in "${env}":`,
        ...issues.map((i) => `  - ${i}`),
      ].join("\n"),
    )
    this.name = "SecretSchemaError"
  }
}
