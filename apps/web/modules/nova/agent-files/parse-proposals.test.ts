import { expect, test } from "bun:test"

import { parseFileProposals, resolveProposalPath } from "./parse-proposals"

test("parses path= fenced full files", () => {
  const text = `
Here is the fix.

\`\`\`tsx path=apps/web/modules/nova-web/components/code-block.tsx
"use client"
export function CodeBlock() { return null }
\`\`\`
`
  const proposals = parseFileProposals(text)
  expect(proposals).toHaveLength(1)
  expect(proposals[0]?.path).toBe("apps/web/modules/nova-web/components/code-block.tsx")
  expect(proposals[0]?.content).toContain("export function CodeBlock")
})

test("resolves invented component paths against the index", () => {
  const indexed = [
    "apps/web/modules/nova-web/components/workspace-panel.tsx",
    "apps/web/modules/nova-web/components/sidebar.tsx",
    "package.json",
  ]
  expect(
    resolveProposalPath("apps/web/components/nova/workspace-panel.tsx", indexed),
  ).toBe("apps/web/modules/nova-web/components/workspace-panel.tsx")
})
