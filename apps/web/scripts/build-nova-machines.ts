import { readFile, rename, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { Template } from "e2b"

import { createE2BWorkspace, e2bCredentials } from "../modules/nova/sandbox/e2b"
import { machineTemplateKey } from "../modules/nova/sandbox/machine-config"
import { MACHINE_SIZES, machineSizeSchema } from "../modules/nova/sandbox/machine-sizes"
import { WORKSPACE } from "../modules/nova/sandbox/policy"

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== "--"),
  allowPositionals: true,
  options: { output: { type: "string" }, "dry-run": { type: "boolean", default: false } },
})
const sizes = (positionals.length ? positionals : ["1cpu-4gb", "2cpu-8gb"]).map((value) => {
  const id = machineSizeSchema.parse(value)
  if (id === "default") throw new Error("Choose an explicit machine size to build")
  return MACHINE_SIZES.find((size) => size.id === id)!
})
const template = Template().fromBaseImage()
  .runCmd("test -x /usr/bin/git && test -x /usr/bin/python3 && test -x /usr/bin/install && test -x /bin/bash")
  .setUser("user")

if (values["dry-run"]) {
  console.log(JSON.stringify({ sizes, template: JSON.parse(await Template.toJSON(template)) }, null, 2))
} else {
  const credentials = e2bCredentials()
  const output = values.output ?? fileURLToPath(new URL("../modules/nova/sandbox/machine-templates.json", import.meta.url))
  const catalog: Record<string, string> = JSON.parse(await readFile(new URL("../modules/nova/sandbox/machine-templates.json", import.meta.url), "utf8"))
  process.env.NOVA_SANDBOX_ENABLED = "true"
  process.env.NOVA_SANDBOX_PROVIDER = "e2b"
  for (const size of sizes) {
    const name = `nova-${size.id}-${crypto.randomUUID().slice(0, 8)}`
    console.log(`Building ${size.id}`)
    const build = await Template.build(template, name, { ...credentials, cpuCount: size.cpuCount!, memoryMB: size.memoryMB! })
    process.env[machineTemplateKey(size.id as Exclude<typeof size.id, "default">)] = build.templateId
    const workspace = await createE2BWorkspace(`nova-template-check-${crypto.randomUUID()}`, AbortSignal.timeout(60_000), size.id)
    try {
      const identity = await workspace.runBounded("/usr/bin/id", ["-u"])
      if (!identity.successful || identity.stdout.trim() === "0") throw new Error("Template must run as an unprivileged user")
      await workspace.sandbox.files.write(`${WORKSPACE}/.nova-template-check`, "persisted")
      await workspace.stop()
      await workspace.resume(AbortSignal.timeout(60_000))
      if (await workspace.sandbox.files.read(`${WORKSPACE}/.nova-template-check`) !== "persisted") throw new Error("Template filesystem persistence check failed")
      catalog[size.id] = build.templateId
      console.log(`Verified ${size.id}: ${build.templateId}`)
    } finally {
      await workspace.sandbox.kill({ signal: AbortSignal.timeout(10_000), requestTimeoutMs: 10_000 })
    }
  }
  await writeFile(`${output}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`)
  await rename(`${output}.tmp`, output)
  console.log(`Saved verified machine templates to ${output}`)
}
