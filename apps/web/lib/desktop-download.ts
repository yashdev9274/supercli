export type DesktopDownload = {
  url: string
  version: string
  checksumUrl: string
  isUnnotarizedBeta: boolean
}

export function resolveDesktopDownload(raw: string | undefined): DesktopDownload | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash) {
      return null
    }
    const match = url.pathname.match(
      /^\/yashdev9274\/supercli\/releases\/download\/desktop-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\/Supercode-\1-universal(-development)?\.dmg$/,
    )
    if (!match) return null
    return {
      url: url.href,
      version: match[1],
      checksumUrl: `${url.href}.sha256`,
      isUnnotarizedBeta: match[2] === "-development",
    }
  } catch {
    return null
  }
}
