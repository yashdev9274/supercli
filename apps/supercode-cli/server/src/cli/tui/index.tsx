import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app.tsx"
import type { SessionController } from "src/cli/session/session-controller.ts"

export type OpenTuiLaunchOptions = {
  subtitle?: string
  session?: SessionController
  provider?: string
  model?: string
  mode?: string
}

/**
 * Launch the OpenTUI interactive shell.
 * Requires Bun (native FFI). Node dist builds should keep chalk until packaging
 * embeds OpenTUI native artifacts (Phase 6).
 */
export async function startOpenTui(options: OpenTuiLaunchOptions = {}): Promise<void> {
  await new Promise<void>(async (resolve, reject) => {
    let settled = false
    const finish = (root?: { unmount: () => void }) => {
      if (settled) return
      settled = true
      try {
        root?.unmount()
      } catch {
        // already unmounted
      }
      resolve()
    }

    try {
      let rootRef: { unmount: () => void; render: (node: unknown) => void } | undefined
      const renderer = await createCliRenderer({
        exitOnCtrlC: true,
        targetFps: 30,
        onDestroy: () => finish(rootRef),
      })

      rootRef = createRoot(renderer)
      rootRef.render(
        <App
          subtitle={options.subtitle}
          session={options.session}
          provider={options.provider}
          model={options.model}
          mode={options.mode}
        />,
      )
    } catch (err) {
      if (!settled) {
        settled = true
        reject(err)
      }
    }
  })
}

export { App } from "./app.tsx"
export { theme } from "./theme.ts"
