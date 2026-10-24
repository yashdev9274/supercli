import type { E2BWorkspace } from "./e2b"
import { WORKSPACE } from "./policy"

// Fetch the archive in the control plane; no GitHub credential enters the VM.
export async function checkoutE2B(workspace: E2BWorkspace, repository: string, token: string, signal: AbortSignal): Promise<void> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository binding")
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(90_000)])
  const response = await fetch(`https://api.github.com/repos/${repository}/tarball`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    signal: boundedSignal, redirect: "follow",
  })
  if (!response.ok || !response.body) throw new Error("GitHub archive checkout failed; check repository access")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > 50_000_000) throw new Error("Repository checkout exceeds 50 MB")
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const archive = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    archive.set(chunk, offset)
    offset += chunk.byteLength
  }
  await workspace.sandbox.files.write("/tmp/nova-checkout.tar.gz", archive.buffer, { signal: boundedSignal })
  const unpack = String.raw`
import tarfile,pathlib
root=pathlib.Path("/vercel/sandbox/repo")
root.mkdir(parents=True,exist_ok=True)
with tarfile.open("/tmp/nova-checkout.tar.gz") as archive:
 members=archive.getmembers()
 if len(members)>100000 or sum(m.size for m in members)>200000000: raise Exception("Repository exceeds extraction limit")
 for m in members:
  parts=pathlib.PurePosixPath(m.name).parts
  if len(parts)<2: continue
  name=pathlib.PurePosixPath(*parts[1:])
  if name.is_absolute() or ".." in name.parts or ".git" in name.parts: raise Exception("Unsafe archive path")
  p=root.joinpath(*name.parts)
  if p.is_symlink() or any(parent.is_symlink() for parent in p.parents): raise Exception("Archive path traverses symlink")
  if m.isdir(): p.mkdir(parents=True,exist_ok=True)
  elif m.isfile():
   p.parent.mkdir(parents=True,exist_ok=True)
   with archive.extractfile(m) as source, p.open("wb") as target: target.write(source.read())
   p.chmod(0o755 if m.mode & 0o111 else 0o644)
  elif m.issym():
   target=(p.parent/m.linkname).resolve()
   if (target!=root and root not in target.parents) or ".git" in target.relative_to(root).parts: raise Exception("Unsafe archive symlink")
   p.parent.mkdir(parents=True,exist_ok=True); p.symlink_to(m.linkname)
  else: raise Exception("Unsupported archive entry")
pathlib.Path("/tmp/nova-checkout.tar.gz").unlink()
`
  const extracted = await workspace.runBounded("/usr/bin/python3", ["-I", "-c", unpack], { signal: boundedSignal, cwd: "/tmp" })
  if (!extracted.successful) throw new Error("E2B archive extraction failed")
  // Archive workspaces have an immutable local baseline, not the upstream SHA.
  const setup = await workspace.runBounded("/bin/bash", ["--noprofile", "--norc", "-c", `git -c init.templateDir= init && printf '%s\\n' '* -filter -text -ident' > .git/info/attributes && git -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null add --all && git -c core.hooksPath=/dev/null -c user.name=Nova -c user.email=nova@localhost commit --allow-empty -m 'Nova archive baseline' && git remote add origin https://github.com/${repository}.git`], { signal: boundedSignal, cwd: WORKSPACE })
  if (!setup.successful) throw new Error("E2B baseline initialization failed")
}
