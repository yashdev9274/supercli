export function browserLiveViewUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null
    if (url.hostname !== "www.browserbase.com" && url.hostname !== "browserbase.com") return null
    if (!/^\/devtools(?:-fullscreen)?\/inspector\.html$/.test(url.pathname)) return null
    return url.href
  } catch { return null }
}
