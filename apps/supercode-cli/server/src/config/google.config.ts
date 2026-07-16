

export const config = {
  get googleApiKey() { return process.env.GOOGLE_GENERATIVE_AI_API_KEY || "" },
  get model() { return process.env.MODEL1 || "gemini-2.5-flash" },
}
