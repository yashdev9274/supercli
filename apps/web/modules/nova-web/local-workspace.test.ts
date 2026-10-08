import { expect, test } from "bun:test"

import {
  isLocalFileReferenceId,
  localFileReference,
  localPathFromReferenceId,
  LOCAL_FILE_ID_PREFIX,
} from "./local-workspace"

test("local file reference ids round-trip", () => {
  const reference = localFileReference(
    { path: "apps/web/partner-security/index.ts", name: "index.ts", kind: "text" },
    "supercli",
  )
  expect(reference.kind).toBe("files")
  expect(reference.id.startsWith(LOCAL_FILE_ID_PREFIX)).toBe(true)
  expect(reference.label).toBe("apps/web/partner-security/index.ts")
  expect(reference.description).toContain("Local")
  expect(isLocalFileReferenceId(reference.id)).toBe(true)
  expect(localPathFromReferenceId(reference.id)).toBe("apps/web/partner-security/index.ts")
  expect(isLocalFileReferenceId("repo_1:src/auth.ts")).toBe(false)
  expect(localPathFromReferenceId("repo_1:src/auth.ts")).toBe(null)
})
