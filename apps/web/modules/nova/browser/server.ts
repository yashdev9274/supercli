import { createBrowserService } from "./lifecycle"
import { browserbaseConfig, browserConfigured, createBrowserbaseProvider } from "./provider"
import { browserStore } from "./store"

export function browserService() {
  return createBrowserService({
    store: browserStore,
    configured: browserConfigured(),
    provider: createBrowserbaseProvider(browserbaseConfig()),
  })
}
