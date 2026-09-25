import { describe, expect, test } from "bun:test"
import {
  createThinkSplitter,
  finalizeAnswerVsProcess,
  looksLikeProcessScratch,
  splitThinkContent,
} from "./split-think-content"

describe("splitThinkContent", () => {
  test("splits deepseek think block from answer", () => {
    const raw =
      "<think>We need interpret. User wants web search about GPT-6 Astra?</think>\n## Findings\nGPT-6 Astra is a model tier."
    const { text, reasoning } = splitThinkContent(raw)
    expect(reasoning).toContain("We need interpret")
    expect(text).toContain("## Findings")
    expect(text).not.toContain("<think>")
    expect(text).not.toContain("We need interpret")
  })

  test("orphan close tag treats prefix as reasoning", () => {
    const raw =
      "We need interpret. User wants web search about GPT-6 Astra? Could use Bing URL.</mm:think>\nAnswer: here are the results."
    const { text, reasoning } = splitThinkContent(raw)
    expect(reasoning).toContain("Could use Bing URL")
    expect(text.trim()).toBe("Answer: here are the results.")
    expect(text).not.toContain("</mm:think>")
  })

  test("streaming across tag boundaries", () => {
    const s = createThinkSplitter()
    const a = s.push("Hello <thi")
    const b = s.push("nk>secret plan")
    const c = s.push("</thi")
    const d = s.push("nk>Visible answer")
    const e = s.flush()
    const text = a.text + b.text + c.text + d.text + e.text
    const reasoning = a.reasoning + b.reasoning + c.reasoning + d.reasoning + e.reasoning
    expect(text).toBe("Hello Visible answer")
    expect(reasoning).toBe("secret plan")
  })

  test("plain answer passes through unchanged", () => {
    const { text, reasoning } = splitThinkContent("Just a normal reply.")
    expect(text).toBe("Just a normal reply.")
    expect(reasoning).toBe("")
  })
})

describe("finalizeAnswerVsProcess", () => {
  test("moves untagged deepseek tool-planning monologue out of Result", () => {
    const raw =
      "User wants web search about GPT-6 Astra. Need provide query. Two searches: " +
      '"GPT-6 Astra" and OpenAI GPT-6 Astra. Use web_search twice. We couldn\'t input query somehow. ' +
      "Must supply parameters properly in invokes."
    expect(looksLikeProcessScratch(raw)).toBe(true)
    const { text, reasoning } = finalizeAnswerVsProcess(raw)
    expect(text).toBe("")
    expect(reasoning).toContain("Need provide query")
  })

  test("keeps real web-search answer in Result", () => {
    const raw = `
## Findings

GPT-6 Astra appears as a model tier name in some listings.

- Source A reports early access notes
- Source B compares latency vs prior tiers

See https://example.com/gpt-6-astra for details.
`.trim()
    const { text, reasoning } = finalizeAnswerVsProcess(raw)
    expect(text).toContain("## Findings")
    expect(reasoning).toBe("")
  })

  test("dedupes Result that copies prior Thinking", () => {
    const prior =
      "User wants web search about GPT-6 Astra. Need provide query. Use web_search twice."
    const { text, reasoning } = finalizeAnswerVsProcess(prior, prior)
    expect(text).toBe("")
    expect(reasoning).toContain("User wants web search")
  })
})
