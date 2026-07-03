import chalk from "chalk"
import { loadEnvOnce } from "src/lib/load-env"
import { firecrawlFetch } from "src/lib/firecrawl"
import {
  theme, heavyDivider, cardStack, frame, errorBox, createSpinner,
} from "src/cli/utils/tui"
import type { SlashCommandResult } from "./index"

// ─── Helpers ────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  loadEnvOnce()
  return process.env.FIRECRAWL_API_KEY ?? null
}

async function directPost(
  url: string, body: unknown, timeout = 60_000,
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const key = getApiKey()
  if (!key) return { ok: false, error: "FIRECRAWL_API_KEY not set" }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const json: any = await res.json()
    if (!res.ok) return { ok: false, error: json.error?.message || json.error || `HTTP ${res.status}` }
    return { ok: true, data: json }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

function heading(cmd: string, detail: string) {
  process.stdout.write(`\r\n`)
  process.stdout.write(heavyDivider() + "\r\n")
  process.stdout.write(` ${chalk.hex(theme.amber)("❯")} /${cmd} ${chalk.hex(theme.muted)(detail)}\r\n`)
  process.stdout.write(heavyDivider() + "\r\n")
}

function printError(msg: string) {
  process.stdout.write(` ${errorBox(msg)}\r\n`)
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + chalk.hex(theme.greenDim)(`\n… (${text.length - max} more chars)`)
}

// ─── Arg parser ─────────────────────────────────────────────────────────────
// Everything before the first ` --` is the positional argument.
// Flags: --key value or --key="value"

function splitArgs(input: string): { positional: string; flags: Record<string, string> } {
  const idx = input.search(/\s--/)
  const pos = idx === -1 ? input.trim() : input.slice(0, idx).trim()
  const flags: Record<string, string> = {}
  if (idx !== -1) {
    const re = /--(\w[\w-]*)(?:\s+("(?:[^"]*)"|(\S+)))?/g
    let m: RegExpExecArray | null
    while ((m = re.exec(input.slice(idx))) !== null) {
      const val = m[2]
      flags[m[1]!] = val !== undefined ? val.replace(/^"(.*)"$/, "$1") : "true"
    }
  }
  return { positional: pos, flags }
}

// ─── /search ────────────────────────────────────────────────────────────────

export async function searchSlash(args: string): Promise<SlashCommandResult> {
  const { positional: query, flags } = splitArgs(args)

  if (!query) {
    heading("search", "usage: <query> [--limit N] [--include d] [--exclude d]")
    printError("Missing query")
    return { type: "help" }
  }

  heading("search", query)

  const body: Record<string, unknown> = {
    query,
    limit: flags.limit ? parseInt(flags.limit, 10) : 10,
    sources: [{ type: "web" }],
  }
  if (flags.include) body.includeDomains = [flags.include]
  if (flags.exclude) body.excludeDomains = [flags.exclude]

  const resp = await firecrawlFetch({
    apiPath: "/search", proxyAction: "firecrawl-search", body, timeout: 30_000,
  })

  if (!resp.ok) { printError(resp.error ?? "Search failed"); return { type: "help" } }

  const webRes = Array.isArray(resp.data?.data?.web) ? resp.data.data.web : []
  const newsRes = Array.isArray(resp.data?.data?.news) ? resp.data.data.news : []
  const all = [...webRes, ...newsRes].slice(0, flags.limit ? parseInt(flags.limit, 10) : 10)

  if (all.length === 0) { printError("No results found"); return { type: "help" } }

  const rows = all.map((r: any, i: number) => {
    const title = chalk.hex(theme.white).bold(r.title ?? "")
    const snippet = r.description ? `\n   ${chalk.hex(theme.muted)(String(r.description).slice(0, 150))}` : ""
    const link = r.url ? `\n   ${chalk.hex(theme.greenDim)(r.url)}` : ""
    return ` ${chalk.hex(theme.greenDim)(`${i + 1}.`)} ${title}${snippet}${link}`
  })

  process.stdout.write(cardStack({ rows, title: "search results" }) + "\r\n")
  process.stdout.write(`\r\n ${chalk.hex(theme.muted)(`${all.length} results`)}\r\n\n`)
  return { type: "help" }
}

// ─── /scrape ────────────────────────────────────────────────────────────────

export async function scrapeSlash(args: string): Promise<SlashCommandResult> {
  const { positional: rawUrl, flags } = splitArgs(args)

  if (!rawUrl) {
    heading("scrape", "usage: <url> [--max N]")
    printError("Missing URL")
    return { type: "help" }
  }

  let url: URL
  try { url = new URL(rawUrl) } catch {
    heading("scrape", rawUrl)
    printError(`Invalid URL: ${rawUrl}`)
    return { type: "help" }
  }

  heading("scrape", url.href)

  const resp = await firecrawlFetch({
    apiPath: "/scrape", proxyAction: "firecrawl-scrape",
    body: { url: url.href, formats: ["markdown"], onlyMainContent: true },
    timeout: 30_000,
  })

  if (!resp.ok) { printError(resp.error ?? "Scrape failed"); return { type: "help" } }

  const md = (resp.data?.data?.markdown ?? "").trim()
  if (!md) { printError("No content found"); return { type: "help" } }

  const max = flags.max ? parseInt(flags.max, 10) : 3000
  process.stdout.write(frame(clamp(md, max), { title: url.hostname, borderColor: theme.green }) + "\r\n")
  process.stdout.write("\r\n")
  return { type: "help" }
}

// ─── /interact ──────────────────────────────────────────────────────────────

export async function interactSlash(args: string): Promise<SlashCommandResult> {
  const { positional: url, flags } = splitArgs(args)

  if (!url) {
    heading("interact", "usage: <url> [--prompt \"...\"] [--max N]")
    printError("Missing URL")
    return { type: "help" }
  }

  heading("interact", flags.prompt ? `${url} --prompt "${flags.prompt}"` : url)

  const resp = await directPost(
    "https://api.firecrawl.dev/v1/interact",
    { url, ...(flags.prompt ? { prompt: flags.prompt } : {}) },
    90_000,
  )

  if (!resp.ok) { printError(resp.error); return { type: "help" } }

  const content = resp.data?.data?.markdown ?? resp.data?.data?.html ?? JSON.stringify(resp.data?.data ?? "")
  const cleaned = String(content).trim()
  if (!cleaned) { printError("No content returned"); return { type: "help" } }

  const max = flags.max ? parseInt(flags.max, 10) : 2000
  process.stdout.write(frame(clamp(cleaned, max), { title: "interaction", borderColor: theme.green }) + "\r\n")
  process.stdout.write("\r\n")
  return { type: "help" }
}

// ─── /crawl ─────────────────────────────────────────────────────────────────

export async function crawlSlash(args: string): Promise<SlashCommandResult> {
  const { positional: url, flags } = splitArgs(args)

  if (!url) {
    heading("crawl", "usage: <url> [--limit N] [--include p] [--exclude p]")
    printError("Missing URL")
    return { type: "help" }
  }

  heading("crawl", url)

  const body: Record<string, unknown> = { url }
  if (flags.limit) body.limit = parseInt(flags.limit, 10)
  if (flags.include) body.includePaths = [flags.include]
  if (flags.exclude) body.excludePaths = [flags.exclude]

  const start = await directPost("https://api.firecrawl.dev/v2/crawl", body)
  if (!start.ok) { printError(start.error); return { type: "help" } }

  const jobId = start.data?.id
  if (!jobId) { printError("Crawl did not return a job ID"); return { type: "help" } }

  const spinner = createSpinner("crawling...").start()
  const key = getApiKey()
  if (!key) { spinner.error("API key required"); return { type: "help" } }

  let result: any = null
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      const json: any = await res.json()
      if (json.status === "completed" || json.status === "finished") { result = json; break }
      if (json.status === "failed") {
        spinner.error("crawl failed")
        printError(json.error || "Crawl job failed")
        return { type: "help" }
      }
    } catch {
      // retry
    }
  }

  if (!result) { spinner.error("timed out"); printError("Crawl did not finish within 2 minutes"); return { type: "help" } }
  const pages = Array.isArray(result.data) ? result.data : []
  spinner.success(`${pages.length} pages crawled`)

  if (pages.length === 0) { printError("No pages crawled"); return { type: "help" } }

  const rows = pages.map((page: any, i: number) => {
    const src = page.metadata?.sourceURL ?? page.url ?? `page ${i + 1}`
    const title = page.metadata?.title ?? ""
    const snip = (page.markdown ?? "").slice(0, 120)
    return ` ${chalk.hex(theme.greenDim)(`${i + 1}.`)} ${chalk.hex(theme.white).bold(title || src)}\n   ${chalk.hex(theme.muted)(snip)}`
  })

  process.stdout.write(cardStack({ rows, title: `crawl (${pages.length})` }) + "\r\n")
  process.stdout.write("\r\n")
  return { type: "help" }
}

// ─── /parse ─────────────────────────────────────────────────────────────────

export async function parseSlash(args: string): Promise<SlashCommandResult> {
  const { positional: filePath, flags } = splitArgs(args)

  if (!filePath) {
    heading("parse", "usage: <filepath> [--max N] [--max-pages N]")
    printError("Missing file path")
    return { type: "help" }
  }

  heading("parse", filePath)

  const key = getApiKey()
  if (!key) { printError("FIRECRAWL_API_KEY is required for /parse"); return { type: "help" } }

  if (!(await Bun.file(filePath).exists())) {
    printError(`Cannot access file: ${filePath}`)
    return { type: "help" }
  }

  const spinner = createSpinner("parsing...").start()

  try {
    const fd = new FormData()
    fd.append("file", Bun.file(filePath))
    if (flags["max-pages"]) {
      fd.append("pdfOptions", JSON.stringify({ maxPages: parseInt(flags["max-pages"], 10) }))
    }

    const res = await fetch("https://api.firecrawl.dev/v2/parse", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
      signal: AbortSignal.timeout(120_000),
    })

    const json: any = await res.json()
    if (!res.ok) {
      spinner.error("parse failed")
      printError(json.error?.message || json.error || `HTTP ${res.status}`)
      return { type: "help" }
    }

    const md = (json.data?.markdown ?? "").trim()
    if (!md) { spinner.error("no content"); printError("No content extracted"); return { type: "help" } }

    spinner.success(`${md.length} chars extracted`)
    const max = flags.max ? parseInt(flags.max, 10) : 3000
    process.stdout.write(frame(clamp(md, max), { title: "parsed", borderColor: theme.green }) + "\r\n")
  } catch (err: any) {
    spinner.error("error")
    printError(err.message || String(err))
  }

  process.stdout.write("\r\n")
  return { type: "help" }
}
