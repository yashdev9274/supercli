import { createBrowserService } from "./lifecycle"
import { browserConfigured, createBrowserbaseProvider } from "./provider"
import { browserStore } from "./store"

export function browserService() {
  return createBrowserService({
    store: browserStore,
    configured: browserConfigured(),
    provider: createBrowserbaseProvider({
      apiKey: process.env.BROWSERBASE_API_KEY ?? "",
      projectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
    }),
  })
}
