import type { Sandbox } from "@vercel/sandbox"
import { canonicalSchemas, validateArguments } from "@super/agent-runtime"
import type { CommandRunner } from "./e2b"
import { relativePath, WORKSPACE } from "./policy"
import { runBounded } from "./tools"

const NAMES = ["read_file", "search_files", "write_file", "edit_file", "read_instructions", "run_command", "code_exec"]
export function canonicalSandboxTools() {
  return NAMES.map((name) => canonicalSchemas[name]!)
}

// This code runs only in the credential-free microVM, never in the web process.
export const CANONICAL_FILE_PROGRAM = String.raw`
import os,sys,json,pathlib,hashlib,tempfile,subprocess
op,a=sys.argv[1],json.loads(sys.argv[2])
root=pathlib.Path("/vercel/sandbox/repo").resolve()
def path(name):
 p=(root/name).resolve()
 if p!=root and root not in p.parents: raise Exception("Path leaves workspace")
 if ".git" in p.relative_to(root).parts: raise Exception("Git metadata is unavailable")
 return p
def read(p):
 if p.stat().st_size>2000000: raise Exception("File exceeds text operation limit")
 return p.read_bytes()
def version(data): return hashlib.sha256(data).hexdigest()
def view(name,start=1,limit=300):
 p=path(name); data=read(p); lines=data.decode("utf-8").splitlines(); end=min(len(lines),start-1+limit)
 selected=lines[start-1:end]; content="\n".join(selected)
 if len(content.encode("utf-8"))>16000: raise Exception("Read output too large; request fewer lines")
 return {"path":name,"content":content,"startLine":start,"endLine":end,"totalLines":len(lines),"truncated":end<len(lines),"nextLine":end+1 if end<len(lines) else None,"version":version(data)}
if op=="read_file": result=view(a["path"],a["startLine"],a["maxLines"])
elif op in ("write_file","edit_file"):
 p=path(a["path"]); exists=p.exists(); data=read(p) if exists else b""
 if a.get("expectedVersion") and (not exists or version(data)!=a["expectedVersion"]): raise Exception("File version changed; read again")
 if op=="edit_file":
  if not exists: raise Exception("File does not exist")
  text=data.decode("utf-8"); count=text.count(a["oldText"])
  if count==0 or (count>1 and not a["replaceAll"]): raise Exception("Old text missing or ambiguous")
  output=text.replace(a["oldText"],a["newText"],-1 if a["replaceAll"] else 1)
 else: output=a["content"]
 if len(output.encode("utf-8"))>2000000: raise Exception("Write exceeds text operation limit")
 p.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(dir=p.parent)
 try:
  with os.fdopen(fd,"wb") as f: f.write(output.encode("utf-8"))
  if exists: os.chmod(tmp,p.stat().st_mode)
  os.replace(tmp,p)
 finally:
  if os.path.exists(tmp): os.unlink(tmp)
 result={"path":a["path"],"created":not exists,"version":version(output.encode("utf-8"))}
elif op=="read_instructions":
 names=[a["path"]] if a.get("path") else ["AGENTS.md","CLAUDE.md","README.md","CONTRIBUTING.md"]
 result={"files":[{"name":name,**view(name,1,300)} for name in names if path(name).is_file()]}
elif op=="search_files":
 # git grep implements canonical ERE/literal semantics and respects tracked paths.
 cmd=["/usr/bin/git","-c","core.fsmonitor=false","grep","--no-index","--exclude-standard","-n","-I","-F" if a["literal"] else "-E","-e",a["pattern"],"--",a.get("include") or ".",":(exclude).git",":(exclude)node_modules"]
 proc=subprocess.Popen(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  out,err=proc.communicate(timeout=15)
  if len(out)>1000000: raise Exception("Search too broad; narrow include")
  if proc.returncode not in (0,1): raise Exception("Search failed: "+err.decode("utf-8",errors="replace")[:300])
  matches=[]
  for line in out.decode("utf-8",errors="replace").splitlines():
   parts=line.split(":",2)
   if len(parts)==3 and parts[1].isdigit(): matches.append({"path":parts[0],"line":int(parts[1]),"content":parts[2][:1000]})
  result={"matches":matches[:a["maxResults"]],"truncated":len(matches)>a["maxResults"]}
 finally:
  if proc.poll() is None: proc.kill(); proc.wait()
else: raise Exception("Unknown canonical file operation")
print(json.dumps({"success":True,"data":result}))
`

export function createCanonicalSandboxExecutor(sandbox: Sandbox | CommandRunner, signal: AbortSignal) {
  return async (name: string, raw: Record<string, unknown>): Promise<Record<string, unknown>> => {
    signal.throwIfAborted()
    if (process.env.NOVA_SANDBOX_ENABLED !== "true") throw new Error("Sandbox execution disabled")
    if (!NAMES.includes(name)) throw new Error("Unknown canonical sandbox capability")
    const args = validateArguments(canonicalSchemas[name]!.function.parameters, raw) as Record<string, unknown>
    if (typeof args.path === "string") relativePath(args.path)
    if (name === "run_command" || name === "code_exec") {
      if (args.interactive || args.autoYes) throw new Error("Interactive commands and automatic approval are unavailable")
      const cwd = typeof args.cwd === "string" ? `${WORKSPACE}/${relativePath(args.cwd)}` : WORKSPACE
      const timeoutMs = Math.min(90_000, Math.max(1, Number(args.timeout ?? 5000)))
      const result = name === "code_exec"
        ? await runBounded(sandbox, "node", ["--input-type=module", "-e", String(args.code)], { signal, timeoutMs, cwd })
        : await runBounded(sandbox, "/bin/bash", ["--noprofile", "--norc", "-c", String(args.command)], { signal, timeoutMs, cwd })
      return { ...result, success: result.successful }
    }
    const result = await runBounded(sandbox, "/usr/bin/python3", ["-I", "-c", CANONICAL_FILE_PROGRAM, name, JSON.stringify(args)], { signal, maxBytes: 20_000 })
    if (!result.successful) return { successful: false, error: result.stderr.slice(0, 1000) || "Sandbox file operation failed" }
    try { return JSON.parse(result.stdout) as Record<string, unknown> }
    catch { throw new Error("Invalid sandbox file operation response") }
  }
}
