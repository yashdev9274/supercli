

export const config = {
  get googleApiKey() { return process.env.GOOGLE_BYOK_PROD_KEY || process.env.GOOGLE_BYOK_DEV_KEY || "" },
  get model() { return process.env.MODEL1 || "gemini-2.5-flash" },
}
