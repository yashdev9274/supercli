import { expect, test } from "bun:test"

import { rankProjectPaths, scoreProjectPath } from "./rank-paths"

const PATHS = [
  "package.json",
  "tsconfig.json",
  "README.md",
  "apps/web/package.json",
  "apps/web/tsconfig.json",
  "apps/web/modules/nova-web/nova-app.tsx",
  "apps/web/modules/nova-web/components/sidebar.tsx",
  "apps/web/modules/nova-web/components/workspace-panel.tsx",
  "apps/web/modules/nova-web/components/thread.tsx",
  "apps/web/modules/nova-web/components/composer.tsx",
  "apps/web/modules/nova/sessions/turn.ts",
  "apps/web/app/layout.tsx",
  "packages/db/prisma/schema.prisma",
  "node_modules/react/index.js",
]

test("right sidebar UI task packs workspace-panel and related sources ahead of configs", () => {
  const objective = "fix the ui of this right sidebar of nova web and make it responsive and adjustable and improve the formatting of files."
  const ranked = rankProjectPaths(PATHS, objective, 8)
  const paths = ranked.map((item) => item.path)

  expect(paths).toContain("apps/web/modules/nova-web/components/workspace-panel.tsx")
  // Should surface nova-web UI sources, not only package.json
  expect(paths.some((path) => path.includes("nova-web") && path.endsWith(".tsx"))).toBe(true)
  expect(paths.filter((path) => path.endsWith("package.json") || path.endsWith("tsconfig.json")).length)
    .toBeLessThanOrEqual(2)

  // Top hit should be a source file for implement intents
  expect(ranked[0]?.kind).toBe("source")
  expect(scoreProjectPath("apps/web/modules/nova-web/components/workspace-panel.tsx", objective))
    .toBeGreaterThan(scoreProjectPath("package.json", objective))
})

test("left sidebar task prefers sidebar.tsx", () => {
  const objective = "polish the left sidebar navigation in nova web"
  const ranked = rankProjectPaths(PATHS, objective, 6)
  expect(ranked.map((item) => item.path)).toContain("apps/web/modules/nova-web/components/sidebar.tsx")
})

test("never selects node_modules paths when better options exist", () => {
  const ranked = rankProjectPaths(PATHS, "fix react import", 6)
  expect(ranked.every((item) => !item.path.includes("node_modules"))).toBe(true)
})
