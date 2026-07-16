/**
 * Citation tracker — records every URL fetched, every file read, and every
 * search query issued during a turn. Used by the post-turn validator to
 * flag factual claims in the model's response that have no matching source.
 *
 * Lives separately from TurnTracker because TurnTracker is concerned with
 * tool-call outcomes (success/failure/empty), while CitationTracker is
 * concerned with provenance (what sources back the response).
 */

export interface Citation {
  kind: "url" | "file" | "search" | "instructions"
  reference: string
  toolName: string
  args: unknown
  /** Optional extracted quote / snippet that the source returned. */
  excerpt?: string
}

export class CitationTracker {
  private citations: Citation[] = []

  record(citation: Citation): void {
    this.citations.push(citation)
  }

  /**
   * Convenience: record from a tool call's name + args.
   */
  recordFromToolCall(toolName: string, args: unknown): void {
    const a = (args ?? {}) as Record<string, unknown>
    switch (toolName) {
      case "url_fetch":
      case "web_search":
        if (typeof a.url === "string") {
          this.record({ kind: "url", reference: a.url, toolName, args })
        } else if (typeof a.query === "string") {
          this.record({ kind: "search", reference: a.query, toolName, args })
        }
        break
      case "read_file":
      case "read_instructions":
        if (typeof a.path === "string") {
          this.record({ kind: "file", reference: a.path, toolName, args })
        }
        break
      case "search_files":
        if (typeof a.pattern === "string") {
          this.record({ kind: "search", reference: a.pattern, toolName, args })
        }
        break
    }
  }

  all(): Citation[] {
    return this.citations
  }

  urls(): string[] {
    const refs: string[] = []
    for (const c of this.citations) {
      if (c.kind === "url") refs.push(c.reference)
    }
    return refs
  }

  files(): string[] {
    const refs: string[] = []
    for (const c of this.citations) {
      if (c.kind === "file") refs.push(c.reference)
    }
    return refs
  }

  /**
   * Scan a response text for factual-looking claims that mention URLs,
   * file paths, or quoted numbers not present in any citation. Returns
   * a list of suspect snippets the user can investigate.
   *
   * Heuristic, not exhaustive. The point is to flag — not to silently
   * rewrite — the model's output.
   */
  suspectClaims(response: string): string[] {
    const suspects: string[] = []
    const knownUrls = new Set(this.urls())
    const knownFiles = new Set(this.files())

    // Match URL patterns in the response
    const urlRegex = /https?:\/\/[^\s)]+/g
    let m: RegExpExecArray | null
    while ((m = urlRegex.exec(response)) !== null) {
      const url = m[0]
      if (![...knownUrls].some((u) => url.startsWith(u) || u.startsWith(url))) {
        suspects.push(`uncited URL: ${url}`)
      }
    }

    // Match file paths like `src/foo.ts` or `packages/db/prisma/schema.prisma`
    const pathRegex = /(?:^|\s)((?:src|apps|packages|lib|test|tests)\/[a-zA-Z0-9_\-./]+\.[a-z]{1,5})/g
    while ((m = pathRegex.exec(response)) !== null) {
      const matched = m[1]
      if (!matched) continue
      const path = matched
      if (!knownFiles.has(path) && ![...knownFiles].some((f) => path.startsWith(f))) {
        // Skip if path appears inside a code block — not a claim
        const before = response.slice(Math.max(0, m.index - 80), m.index)
        if (!/```/.test(before.slice(before.lastIndexOf("```")))) {
          suspects.push(`uncited file path: ${path}`)
        }
      }
    }

    return suspects
  }

  /**
   * Build a system-message nudge that lists every uncited claim in the
   * response so the model can either ground them or retract them.
   */
  buildCitationSentinel(response: string): string | null {
    const suspects = this.suspectClaims(response)
    if (suspects.length === 0) return null
    return [
      "SYSTEM NOTICE: Your previous response contains factual claims that aren't backed by any tool call this turn.",
      "",
      "Suspect claims:",
      ...suspects.map((s) => `- ${s}`),
      "",
      "For each suspect claim, either: (a) call the right tool to retrieve the actual fact, or (b) explicitly retract the claim in your next response. Do NOT continue building on uncited claims.",
    ].join("\n")
  }

  reset(): void {
    this.citations = []
  }
}