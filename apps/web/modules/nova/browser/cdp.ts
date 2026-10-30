import { chromium, type Browser } from "playwright-core"

import { ACTION_TIMEOUT_MS, BrowserError } from "./contracts"
import { publicBrowserUrl, safeBrowserLink } from "./url-policy"

export type BrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "inspect" }
  | { kind: "screenshot" }
  | { kind: "click"; index: number }
  | { kind: "type"; index: number; text: string }
  | { kind: "scroll"; direction: "up" | "down" }

export async function runCdpAction(input: {
  connection: string
  action: BrowserAction
  check: () => Promise<void>
  signal?: AbortSignal
  connect?: typeof chromium.connectOverCDP
}): Promise<{ text?: string; image?: Uint8Array }> {
  let browser: Browser | undefined
  let expired = false
  const cancel = () => {
    expired = true
    // Do not release the DB action lease here: await the actual work/finally.
    void browser?.close().catch(() => undefined)
  }
  const timer = setTimeout(cancel, ACTION_TIMEOUT_MS)
  input.signal?.addEventListener("abort", cancel, { once: true })
  const check = async () => {
    if (expired || input.signal?.aborted) throw new BrowserError("Browser action cancelled")
    await input.check()
  }
  try {
    await check()
    browser = await (input.connect ?? chromium.connectOverCDP.bind(chromium))(input.connection, { timeout: 6_000 })
    await check()
    const context = browser.contexts()[0]
    if (!context) throw new BrowserError("Browser context unavailable")
    const page = context.pages()[0] ?? await context.newPage()
    page.setDefaultTimeout(4_000)
    page.setDefaultNavigationTimeout(6_000)
    // Intercept redirects/subresources while connected. No form submissions,
    // uploads or mutating HTTP methods are admitted by agent operations.
    await context.route("**/*", async (route) => {
      try {
        await check()
        if (!["GET", "HEAD"].includes(route.request().method())) throw new Error()
        await publicBrowserUrl(route.request().url())
        await route.continue()
      } catch { await route.abort().catch(() => undefined) }
    })
    if (page.url() !== "about:blank") await publicBrowserUrl(page.url())
    await check()
    const action = input.action
    if (action.kind === "navigate") {
      const url = await publicBrowserUrl(action.url)
      if (!safeBrowserLink(url)) throw new BrowserError("This navigation requires human control")
      await check()
      await page.goto(url, { waitUntil: "domcontentloaded" })
    } else if (action.kind === "click") {
      // Link-only click intentionally avoids arbitrary JS-backed buttons and
      // consequential actions. Match the inspect result's index, not selectors.
      const link = page.locator("a[href]").nth(action.index)
      const href = await link.getAttribute("href")
      const label = await link.innerText({ timeout: 2_000 })
      if (!href || !safeBrowserLink(`${href} ${label}`)) throw new BrowserError("This interaction requires human control")
      const target = await publicBrowserUrl(new URL(href, page.url()).toString())
      await check()
      await page.goto(target, { waitUntil: "domcontentloaded" })
    } else if (action.kind === "type") {
      // Search fields only, no credentials, forms, buttons, uploads or submit.
      // Built-in DOM inspection is fixed source; there is no JS execution tool.
      const field = page.locator('input[type="search"]').nth(action.index)
      const sensitive = await field.evaluate((element) => {
        const input = element as HTMLInputElement
        return /password|token|secret|credential|card|payment|email|phone|otp|code/i.test(`${input.name} ${input.id} ${input.autocomplete}`)
      }, undefined, { timeout: 2_000 })
      if (sensitive || /password|secret|api[_ -]?key|bearer|credit.?card/i.test(action.text)) throw new BrowserError("Credential entry requires human control")
      await check()
      await field.fill(action.text, { timeout: 3_000 })
    } else if (action.kind === "scroll") {
      await page.mouse.wheel(0, action.direction === "down" ? 600 : -600)
    } else if (action.kind === "screenshot") {
      const image = await page.screenshot({ type: "jpeg", quality: 45, fullPage: false, timeout: 4_000, clip: { x: 0, y: 0, width: Math.min(page.viewportSize()?.width ?? 1280, 1280), height: Math.min(page.viewportSize()?.height ?? 800, 800) } })
      await check()
      return { image }
    }
    await check()
    if (page.url() !== "about:blank") await publicBrowserUrl(page.url())
    const snapshot = await page.locator("body").evaluate((body) => {
      const text = (body instanceof HTMLElement ? body.innerText : body.textContent ?? "").slice(0, 8000)
      const links = Array.from(body.querySelectorAll("a[href]")).slice(0, 40).map((node, index) => ({ index, label: (node.textContent ?? "").slice(0, 100), href: (node.getAttribute("href") ?? "").slice(0, 250) }))
      const searchFields = Array.from(body.querySelectorAll('input[type="search"]')).slice(0, 10).map((node, index) => ({ index, label: (node.getAttribute("aria-label") ?? node.getAttribute("placeholder") ?? "Search").slice(0, 100) }))
      return { text, links, searchFields }
    }, undefined, { timeout: 3_000 })
    await check()
    return { text: JSON.stringify({ untrustedPageContent: true, url: page.url().slice(0, 2048), ...snapshot }).slice(0, 14_000) }
  } catch (error) {
    if (error instanceof BrowserError) throw error
    throw new BrowserError("Browser action failed or timed out; inspect or take control")
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener("abort", cancel)
    // close on a CDP-connected browser disconnects this client, preserving the
    // provider's existing shared context. Await it before releasing the lease.
    await browser?.close()
  }
}
