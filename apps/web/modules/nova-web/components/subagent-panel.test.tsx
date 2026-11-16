import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import { collectSubagents } from "../subagents"
import type { TimelineActivity } from "../types"
import { SubagentDetail, SubagentOverview } from "./subagent-panel"

const activity: TimelineActivity = {
  kind: "activity", id: "event", sessionId: "session", runId: "run", sequence: 1,
  type: "subagent", title: "Trace auth", status: "done", data: null, createdAt: "2026-11-14T12:00:00Z",
  body: JSON.stringify({ type: "subagent", childId: "child", index: 2, title: "Trace auth", prompt: "Find the auth boundary", agent: "explore", provider: "openai", model: "gpt-6.1-sol", status: "done", timestamp: "2026-11-14T12:00:00Z", message: "The boundary is middleware. <script>" }),
}

test("overview exposes an accessible collapsible list and child open button", () => {
  const html = renderToStaticMarkup(<SubagentOverview onOpen={() => {}}>{collectSubagents([activity])}</SubagentOverview>)
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain("Open Subagent 2: Trace auth")
  expect(html).toContain("gpt-6.1-sol")
  expect(html).not.toContain("animate-spin")
  expect(renderToStaticMarkup(<SubagentOverview onOpen={() => {}}>{[]}</SubagentOverview>)).toBe("")
})

test("detail renders only real prompt, timestamp and reply, with honest workspace information", () => {
  const html = renderToStaticMarkup(<SubagentDetail child={collectSubagents([activity])[0]} />)
  expect(html).toContain("Find the auth boundary")
  expect(html).toContain("Shared workspace · read-only")
  expect(html).toContain("Final reply")
  expect(html).toContain('dateTime="2026-11-14T12:00:00Z"')
  expect(html).toContain("The boundary is middleware. &lt;script&gt;")
  expect(html).not.toContain("Send")
  expect(html).not.toContain("Stop")
  expect(html).not.toContain("isolated")
})

test("detail shows an honest empty transcript and missing child state", () => {
  const child = collectSubagents([{ ...activity, body: activity.body!.replace(',"message":"The boundary is middleware. <script>"', "") }])[0]
  expect(renderToStaticMarkup(<SubagentDetail child={child} />)).toContain("No progress messages recorded yet")
  expect(renderToStaticMarkup(<SubagentDetail child={undefined} />)).toContain("retained timeline")
})
