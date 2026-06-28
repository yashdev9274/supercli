import { z } from "zod"

const urlFetchSchema = z.object({
  url: z.string().describe("URL to fetch content from"),
  maxChars: z.number().optional().default(8000).describe("Maximum characters to extract"),
})

export type UrlFetchArgs = z.infer<typeof urlFetchSchema>

// Structured tool result envelope. The model can distinguish "tool ran
// successfully but returned nothing" from "tool failed with an error" by
// checking `success` and `error` fields. Critical for stopping the
// "fetch returned empty → invent an answer" hallucination loop.
export type UrlFetchResult =
  | { success: true; content: string; bytesRead: number; status: number; contentType: string }
  | { success: false; error: string; status?: number; contentType?: string; hint?: string }

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "header",
  "footer",
  "nav",
])

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "aside",
  "header",
  "footer",
  "nav",
  "br",
  "hr",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "blockquote",
  "tr",
  "table",
])

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

// Extract readable text from HTML using a small tag-walker instead of
// regex-stripping every tag. Previous implementation collapsed 265KB of
// GitHub HTML into a single whitespace-stripped wall of CSS class names,
// which the model then saw as "empty content" and invented around.
//
// Strategy:
//   1. Walk the HTML as a stream of tags + text nodes.
//   2. Drop contents of <script>, <style>, <svg>, <nav>, <footer>, etc.
//   3. For block-level elements, insert a newline so output has structure.
//   4. For headings, prefix with "# " (markdown-ish).
//   5. For <pre>/<code>, preserve whitespace.
//   6. For <a href="...">, append " (URL)" so links aren't lost.
//   7. For <meta name="description" content="..."> and <meta property="og:*">,
//      prepend them as a short summary at the top.
//   8. Collapse runs of blank lines but keep single newlines for readability.
function htmlToReadableText(html: string): { text: string; metaSummary: string } {
  const meta: Record<string, string> = {}
  const metaSummaryParts: string[] = []

  // Extract <meta> tags BEFORE we walk the body, because some meta tags are
  // self-closing or have unusual attribute orderings that the walker ignores.
  const metaRe = /<meta\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0]
    const name = (tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1]
    const content = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1]
    if (!name || !content) continue
    const key = name.toLowerCase()
    if (key === "description" || key.startsWith("og:") || key === "twitter:description") {
      meta[key] = content
    }
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch && titleMatch[1]) {
    meta.title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  }

  if (meta.title) metaSummaryParts.push(meta.title)
  if (meta.description) metaSummaryParts.push(meta.description)
  else if (meta["og:description"]) metaSummaryParts.push(meta["og:description"])
  const metaSummary = metaSummaryParts.join(" — ")

  // Try to isolate the main content block FIRST, before walking. Many sites
  // (GitHub, blogs) wrap the actual article in <main>, <article>, or a div
  // with role="main". Extracting that subtree eliminates nav/header/footer
  // noise that wastes the char budget.
  function extractMain(h: string): string {
    const candidates: Array<RegExpMatchArray | null> = [
      h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i),
      h.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i),
      h.match(/<div\b[^>]*\brole\s*=\s*["']main["'][^>]*>([\s\S]*?)<\/div>\s*<!--\s*\/role\s*=/i),
      h.match(/<div\b[^>]*class\s*=\s*["'][^"']*\bapplication-main\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
      h.match(/<div\b[^>]*class\s*=\s*["'][^"']*\bmarkdown-body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i),
    ]
    for (const c of candidates) {
      if (c && c[1] && c[1].length > 200) return c[1]
    }
    return h
  }
  let body = extractMain(html)

  // Walk tags.
  let out = ""
  const stack: string[] = []
  let skipDepth = 0

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const flushText = (start: number, end: number) => {
    if (skipDepth > 0) return
    const raw = body.slice(start, end)
    const text = raw
      .replace(/<[^>]+>/g, "") // safety net for stray inline tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    if (!text) return
    const top = stack[stack.length - 1]
    const preserveWs = top === "pre" || top === "code"
    out += preserveWs ? text : text.replace(/\s+/g, " ")
  }

  while ((match = tagRe.exec(body)) !== null) {
    const fullMatch = match[0]
    const tagName = (match[1] ?? "").toLowerCase()
    const attrsStr = match[2] || ""
    const isClosing = fullMatch.startsWith("</")
    const isSelfClosing = /\/\s*$/.test(attrsStr) || ["br", "hr", "img", "meta", "link", "input"].includes(tagName)

    // Flush text between previous tag end and this tag start.
    if (match.index > lastIndex) {
      flushText(lastIndex, match.index)
    }
    lastIndex = match.index + fullMatch.length

    if (isClosing) {
      if (skipDepth > 0 && stack[stack.length - 1] === tagName) {
        skipDepth--
        stack.pop()
        continue
      }
      if (stack[stack.length - 1] === tagName) {
        stack.pop()
        if (BLOCK_TAGS.has(tagName)) out += "\n"
        if (HEADING_TAGS.has(tagName)) out += "\n"
      }
      continue
    }

    // Opening or self-closing tag.
    if (SKIP_TAGS.has(tagName)) {
      // Skip the entire subtree, including its closing tag.
      skipDepth++
      stack.push(tagName)
      // Self-closing skip tags don't need a closing tag, but most aren't.
      // If self-closing, don't increment again on close.
      if (isSelfClosing) {
        skipDepth--
        stack.pop()
      }
      continue
    }

    if (isSelfClosing) {
      if (tagName === "br") out += "\n"
      if (tagName === "hr") out += "\n---\n"
      continue
    }

    // Block-level: add newline BEFORE opening tag for readability.
    if (BLOCK_TAGS.has(tagName) && out.length > 0 && !out.endsWith("\n")) {
      out += "\n"
    }
    if (HEADING_TAGS.has(tagName)) {
      const level = parseInt(tagName[1] ?? "1", 10)
      out += `${"#".repeat(level)} `
    }
    if (tagName === "li") out += "- "
    if (tagName === "pre") out += "\n```\n"

    stack.push(tagName)
  }
  // Flush trailing text.
  if (lastIndex < body.length) {
    flushText(lastIndex, body.length)
  }

  // Collapse blank lines and trim each line.
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let cleaned = lines.join("\n")

  // Cap at a reasonable size before returning.
  const MAX = 60_000
  if (cleaned.length > MAX) {
    cleaned = cleaned.slice(0, MAX) + "\n\n[...truncated...]"
  }

  return { text: cleaned, metaSummary }
}

export const urlFetchTool = {
  description:
    "Fetch and extract text content from a URL. Use this to read documentation, articles, or any web page the user references. " +
    "Returns a structured result: { success: true, content } on success, or { success: false, error, hint } on failure. " +
    "For GitHub URLs: prefer api.github.com (e.g. https://api.github.com/repos/owner/name) or raw.githubusercontent.com for files — these return JSON/plain text without needing HTML extraction. " +
    "If success is false, do NOT invent content — relay the error to the user and try a different approach.",
  parameters: urlFetchSchema,
  execute: async ({ url, maxChars }: UrlFetchArgs): Promise<string> => {
    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch {
      const result: UrlFetchResult = {
        success: false,
        error: `Invalid URL: "${url}"`,
        hint: "URLs must include the scheme, e.g. https://example.com/path",
      }
      return JSON.stringify(result)
    }

    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      const result: UrlFetchResult = {
        success: false,
        error: `Unsupported URL scheme: ${urlObj.protocol}`,
        hint: "Only http:// and https:// URLs are allowed",
      }
      return JSON.stringify(result)
    }

    // GitHub HTML page hint: suggest the API or raw URL up front so the model
    // can pivot without burning another tool call.
    const isGithubHtml =
      urlObj.hostname === "github.com" || urlObj.hostname === "www.github.com"
    const ghHint = isGithubHtml
      ? "For GitHub repo pages, prefer https://api.github.com/repos/{owner}/{name} (returns JSON) or https://raw.githubusercontent.com/{owner}/{name}/main/README.md (returns raw text). These avoid HTML extraction entirely."
      : undefined

    try {
      const response = await fetch(url, {
        headers: {
          // Use a browser-like UA so we don't get served challenge pages or
          // bot-detection stubs that return empty bodies.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      })

      const contentType = response.headers.get("content-type") ?? ""

      if (!response.ok) {
        const result: UrlFetchResult = {
          success: false,
          error: `HTTP ${response.status} ${response.statusText}`,
          status: response.status,
          contentType,
          hint:
            response.status === 403 || response.status === 401
              ? `The site blocked the request. Try a different URL, the site's API endpoint, or web_search.${ghHint ? " " + ghHint : ""}`
              : response.status === 404
                ? "The URL returned 404. Verify the URL is correct."
                : response.status >= 500
                  ? "The site is having issues. Try again later or use web_search."
                  : ghHint,
        }
        return JSON.stringify(result)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        const result: UrlFetchResult = {
          success: false,
          error: "Response had no body",
          status: response.status,
          contentType,
          hint: ghHint,
        }
        return JSON.stringify(result)
      }

      const decoder = new TextDecoder()
      let accumulated = ""
      let bytesRead = 0
      let done = false
      // Read up to 2x maxChars so HTML extraction has room to work after
      // stripping tags. Hard cap at 5MB to avoid runaway reads.
      const HARD_CAP = 5_000_000
      const readLimit = Math.min(Math.max(maxChars * 2, 200_000), HARD_CAP)
      while (!done && accumulated.length < readLimit) {
        const { value, done: chunkDone } = await reader.read()
        done = chunkDone
        if (value) {
          bytesRead += value.byteLength
          accumulated += decoder.decode(value, { stream: !done })
        }
      }

      // Strip HTML if the response is HTML; otherwise leave as-is.
      let cleaned = accumulated
      if (contentType.includes("html")) {
        const { text, metaSummary } = htmlToReadableText(accumulated)
        // Prepend a meta summary line so even sparse pages give the model
        // something useful (title + description from <meta> tags).
        cleaned = (metaSummary ? `${metaSummary}\n\n` : "") + text
      } else {
        cleaned = cleaned.trim()
      }

      if (cleaned.length === 0) {
        const result: UrlFetchResult = {
          success: false,
          error: "Fetched URL returned no extractable text content",
          status: response.status,
          contentType,
          hint:
            contentType.includes("html")
              ? `The page is likely JavaScript-rendered (SPA). Server returned empty HTML — content is loaded by JS that fetch() does not execute.${ghHint ? " " + ghHint : ""}`
              : "Empty body. Try a different URL.",
        }
        return JSON.stringify(result)
      }

      // Heuristic: detect SPA loading shells that contain almost no real content.
      // Common markers: GitHub's "Uh oh!" error page, generic "Loading..." text,
      // or React hydration placeholders. Treat these as failed fetches so the
      // model doesn't try to answer from the placeholder.
      const SPA_SHELL_MARKERS = [
        /Uh oh![\s\S]{0,200}error while loading/i,
        /Please reload this page/i,
        /^[\s\S]{0,500}loading[\s\S]{0,500}$/i,
        /JavaScript is required/i,
      ]
      const isSpaShell =
        cleaned.length < 600 &&
        SPA_SHELL_MARKERS.some((re) => re.test(cleaned))
      if (isSpaShell) {
        const result: UrlFetchResult = {
          success: false,
          error: `Fetched URL returned a JavaScript-rendered loading shell (${cleaned.length} chars, no real content)`,
          status: response.status,
          contentType,
          hint: ghHint ?? "The page is an SPA. Use the site's JSON API or a raw-content URL (e.g. raw.githubusercontent.com for GitHub).",
        }
        return JSON.stringify(result)
      }

      const result: UrlFetchResult = {
        success: true,
        content: cleaned.slice(0, maxChars),
        bytesRead,
        status: response.status,
        contentType,
      }
      return JSON.stringify(result)
    } catch (error: any) {
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError"
      const result: UrlFetchResult = {
        success: false,
        error: isTimeout
          ? "Request timed out after 15 seconds"
          : error instanceof Error
            ? error.message
            : String(error),
        hint: isTimeout
          ? `The site is slow or unreachable. Try web_search or a different URL.${ghHint ? " " + ghHint : ""}`
          : ghHint,
      }
      return JSON.stringify(result)
    }
  },
}