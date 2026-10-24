import type { Sandbox } from "@vercel/sandbox"
import { z } from "zod"
import type { CommandRunner } from "./e2b"

import type { HarnessChatTool } from "@/modules/nova/harness/client"
import { MAX_OUTPUT_BYTES, MAX_PATCH_BYTES, relativePath, WORKSPACE } from "./policy"

const path = z.string().max(512).transform(relativePath)
const schemas = {
  nova_sandbox_list: z.object({ path: path.default(".") }).strict(),
  nova_sandbox_read: z.object({ path, offset: z.number().int().min(0).max(10_000_000).default(0) }).strict(),
  nova_sandbox_search: z.object({ query: z.string().min(1).max(200), path: path.default(".") }).strict(),
  nova_sandbox_write: z.object({ path, content: z.string().max(100_000) }).strict(),
  nova_sandbox_patch: z.object({ path, search: z.string().min(1).max(100_000), replacement: z.string().max(100_000) }).strict(),
  nova_sandbox_command: z.object({ command: z.string().min(1).max(8000), timeoutMs: z.number().int().min(1000).max(90_000).default(60_000) }).strict(),
  nova_sandbox_git_status: z.object({}).strict(),
  nova_sandbox_git_diff: z.object({}).strict(),
}
const descriptions: Record<keyof typeof schemas, string> = {
  nova_sandbox_list: "List a directory in the cloud workspace (not the user's computer).",
  nova_sandbox_read: "Read up to 16000 bytes of a workspace file, with byte offset for pagination.",
  nova_sandbox_search: "Search literal text in workspace files, excluding .git and node_modules. Narrow the path for large trees.",
  nova_sandbox_write: "Write a real UTF-8 file in the cloud workspace, creating parent directories.",
  nova_sandbox_patch: "Replace exactly one matching string in a real file. Fails if the search is absent or ambiguous.",
  nova_sandbox_command: "Run a shell command in the isolated cloud VM. Use to install dependencies and run tests. No credentials, GitHub access or local laptop access. Commands and output are bounded; no background servers.",
  nova_sandbox_git_status: "Get actual Git status in the cloud workspace.",
  nova_sandbox_git_diff: "Get tracked changes against the original checkout. Final downloadable patch also includes untracked files.",
}
export function sandboxTools(): HarnessChatTool[] {
  return Object.entries(schemas).map(([name, schema]) => ({
    type: "function", function: { name, description: descriptions[name as keyof typeof schemas], parameters: z.toJSONSchema(schema, { io: "input" }) },
  }))
}

export async function runBounded(sandbox: Sandbox | CommandRunner, cmd: string, args: string[], options: { signal?: AbortSignal; timeoutMs?: number; cwd?: string; maxBytes?: number } = {}) {
  if ("runBounded" in sandbox) return sandbox.runBounded(cmd, args, options)
  options.signal?.throwIfAborted()
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(options.timeoutMs ?? 60_000)])
  const command = await sandbox.runCommand({ cmd, args, cwd: options.cwd ?? WORKSPACE, detached: true, timeoutMs: options.timeoutMs ?? 60_000, signal, env: { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_PAGER: "cat" } })
  let stdout = ""
  let stderr = ""
  let bytes = 0
  let truncated = false
  const limit = options.maxBytes ?? MAX_OUTPUT_BYTES
  try {
    for await (const log of command.logs({ signal })) {
      bytes += Buffer.byteLength(log.data)
      if (bytes > limit) {
        truncated = true
        await command.kill("SIGKILL", { abortSignal: AbortSignal.timeout(5000) })
        break
      }
      if (log.stream === "stdout") stdout += log.data
      else stderr += log.data
    }
    const finished = await command.wait({ signal })
    return { successful: finished.exitCode === 0 && !truncated, exitCode: finished.exitCode, stdout, stderr, truncated }
  } finally {
    if (signal.aborted || truncated) await command.kill("SIGKILL", { abortSignal: AbortSignal.timeout(5000) }).catch(() => {})
  }
}

// -I isolates Python from repository modules/PYTHONPATH. This is a convenience
// path boundary, not a security jail for shell tools; the microVM is that boundary.
const FILE_TOOL = String.raw`
import os,sys,json,pathlib
op,a=sys.argv[1],json.loads(sys.argv[2])
root=pathlib.Path("/vercel/sandbox/repo").resolve()
p=(root/a.get("path",".")).resolve()
if p != root and root not in p.parents: raise Exception("Symlink leaves workspace")
if ".git" in p.relative_to(root).parts: raise Exception("Git metadata is not editable")
if op=="list":
 print(json.dumps(sorted(os.listdir(p))[:500]))
elif op=="read":
 with open(p,"rb") as f:
  f.seek(a["offset"]); data=f.read(16001)
 print(json.dumps({"content":data[:16000].decode("utf-8",errors="replace"),"truncated":len(data)>16000,"nextOffset":a["offset"]+min(len(data),16000)}))
elif op=="write":
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(a["content"]); print("wrote "+a["path"])
elif op=="patch":
 if p.stat().st_size>200000: raise Exception("File too large for exact patch")
 text=p.read_text()
 if text.count(a["search"])!=1: raise Exception("Search must match exactly once")
 p.write_text(text.replace(a["search"],a["replacement"],1)); print("wrote "+a["path"])
elif op=="search":
 matches=[]; visited=0
 for parent,dirs,files in os.walk(p,followlinks=False):
  dirs[:]=[d for d in dirs if d not in (".git","node_modules",".next","dist") and not pathlib.Path(parent,d).is_symlink()]
  for name in files:
   f=pathlib.Path(parent,name); visited+=1
   if visited>5000 or len(matches)>=100: break
   if f.is_symlink() or f.stat().st_size>200000: continue
   try:
    for n,line in enumerate(f.read_text().splitlines(),1):
     if a["query"] in line: matches.append({"path":str(f.relative_to(root)),"line":n,"text":line[:200]})
     if len(matches)>=100: break
   except (UnicodeError,OSError): pass
  if visited>5000 or len(matches)>=100: break
 print(json.dumps({"matches":matches,"bounded":visited>5000 or len(matches)>=100}))
`

export function createToolExecutor(sandbox: Sandbox | CommandRunner, baseSha: string, signal: AbortSignal) {
  return async (name: string, args: Record<string, unknown>) => {
    signal.throwIfAborted()
    if (process.env.NOVA_SANDBOX_ENABLED !== "true") throw new Error("Sandbox execution disabled")
    const schema = schemas[name as keyof typeof schemas]
    if (!schema) throw new Error("Unknown sandbox tool")
    const parsed = schema.parse(args)
    if (name === "nova_sandbox_command" && "command" in parsed) {
      return runBounded(sandbox, "/bin/bash", ["--noprofile", "--norc", "-c", parsed.command], { signal, timeoutMs: parsed.timeoutMs })
    }
    if (name === "nova_sandbox_git_status") return runBounded(sandbox, "/usr/bin/git", ["-c", "core.fsmonitor=false", "status", "--short", "--untracked-files=normal"], { signal })
    if (name === "nova_sandbox_git_diff") return runBounded(sandbox, "/usr/bin/git", ["-c", "core.fsmonitor=false", "diff", "--no-ext-diff", "--no-textconv", baseSha, "--"], { signal })
    return runBounded(sandbox, "/usr/bin/python3", ["-I", "-c", FILE_TOOL, name.replace("nova_sandbox_", ""), JSON.stringify(parsed)], { signal })
  }
}

// Do not stage files (git add could execute repository-defined clean filters).
// Compare to the immutable control-plane base SHA, including agent-made commits.
const EXPORT_PATCH = String.raw`
import subprocess,sys,pathlib
base=sys.argv[1]; limit=int(sys.argv[2]); data=bytearray()
git=["/usr/bin/git","-c","core.fsmonitor=false","-c","core.hooksPath=/dev/null"]
def append(args,allowed=(0,)):
 p=subprocess.Popen(git+args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 try:
  while True:
   chunk=p.stdout.read(8192)
   if not chunk: break
   data.extend(chunk)
   if len(data)>limit: raise Exception("Patch exceeds download limit; workspace retained")
  if p.wait() not in allowed: raise Exception("Patch export failed")
 finally:
  if p.poll() is None: p.kill(); p.wait()
append(["diff","--binary","--no-ext-diff","--no-textconv",base,"--"])
p=subprocess.Popen(git+["ls-files","--others","--exclude-standard","-z"],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
try:
 files=p.stdout.read(1000001)
 if len(files)>1000000: raise Exception("Too many untracked paths")
 if p.wait()!=0: raise Exception("Cannot enumerate untracked paths")
finally:
 if p.poll() is None: p.kill(); p.wait()
for f in files.split(b"\0"):
 if not f: continue
 name=f.decode("utf-8")
 if not pathlib.Path(name).is_symlink() and not pathlib.Path(name).is_file(): raise Exception("Unsupported untracked file")
 append(["diff","--binary","--no-ext-diff","--no-textconv","--no-index","--","/dev/null",name],(0,1))
sys.stdout.buffer.write(data)
`
export async function exportPatch(sandbox: Sandbox | CommandRunner, baseSha: string): Promise<string> {
  const result = await runBounded(sandbox, "/usr/bin/python3", ["-I", "-c", EXPORT_PATCH, baseSha, String(MAX_PATCH_BYTES)], { timeoutMs: 20_000, maxBytes: MAX_PATCH_BYTES })
  if (!result.successful) throw new Error("Patch export failed or exceeded 1 MB; cloud workspace retained")
  return result.stdout
}
