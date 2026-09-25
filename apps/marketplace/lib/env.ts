function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const env = {
  get INTEGRATION_CLIENT_ID() {
    return required("INTEGRATION_CLIENT_ID")
  },
  get INTEGRATION_CLIENT_SECRET() {
    return required("INTEGRATION_CLIENT_SECRET")
  },
  get HOST() {
    return optional("HOST", "http://localhost:3010").replace(/\/$/, "")
  },
  get SUPERCODE_APP_URL() {
    return optional("SUPERCODE_APP_URL", "http://localhost:3000").replace(/\/$/, "")
  },
  get MARKETPLACE_PRODUCT_SLUG() {
    return optional("MARKETPLACE_PRODUCT_SLUG", "supercode-review")
  },
  get DATABASE_URL() {
    return process.env.DATABASE_URL
  },
}
