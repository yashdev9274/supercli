import { createAuthClient } from "better-auth/react"
import {
  deviceAuthorizationClient,
  oneTimeTokenClient,
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  // Always use the Next.js/Vercel proxy, not the backend URL inferred from env.
  fetchOptions: {
    baseURL: "/api/auth",
  },
  plugins: [
    deviceAuthorizationClient(),
    oneTimeTokenClient(),
  ],
})
