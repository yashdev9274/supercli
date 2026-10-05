export type PublicPrIdentity = {
  owner: string
  repo: string
  prNumber: number
  url: string
}

export function parsePublicPrUrl(input: string): PublicPrIdentity {
  const message = "Enter a public GitHub pull request URL, such as https://github.com/owner/repo/pull/123."
  if (typeof input !== "string" || input.length > 2048 || /[\x00-\x1f\x7f\\]/.test(input)) {
    throw new Error(message)
  }
  const match = input.trim().match(
    /^(?:https:\/\/)?github\.com\/([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)\/([a-z\d_.-]{1,100})\/pull\/([1-9]\d{0,9})(?:\/files)?\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/i,
  )
  if (!match || match[2] === "." || match[2] === "..") throw new Error(message)
  const prNumber = Number(match[3])
  if (!Number.isSafeInteger(prNumber) || prNumber > 2_147_483_647) throw new Error(message)
  const owner = match[1].toLowerCase()
  const repo = match[2].toLowerCase()
  return { owner, repo, prNumber, url: `https://github.com/${owner}/${repo}/pull/${prNumber}` }
}
