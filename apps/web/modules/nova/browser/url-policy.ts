import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { BrowserError } from "./contracts"

type Resolve = (host: string) => Promise<string[]>
const defaultResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address)

export function isPublicAddress(address: string): boolean {
  // Conservative IPv4-only policy also rejects IPv4-mapped IPv6, zone IDs,
  // NAT64 and IPv6 special-purpose ranges rather than missing an alias.
  if (isIP(address) !== 4) return false
  const [a, b, c] = address.split(".").map(Number)
  if ([0, 10, 127].includes(a) || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99) || (b === 2))) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

export async function publicBrowserUrl(value: string, resolve: Resolve = defaultResolve): Promise<string> {
  try {
    if (value.length > 2048) throw new Error()
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, "")
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error()
    if (!host.includes(".") || /(^|\.)(localhost|local|internal|home|lan|test|invalid|onion)$/.test(host)) throw new Error()
    const addresses = isIP(host) ? [host] : await resolve(host)
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) throw new Error()
    return url.toString()
  } catch {
    throw new BrowserError("Browser tools require a public HTTP(S) URL", 400)
  }
}

export function safeBrowserLink(value: string): boolean {
  return !/logout|signout|delete|remove|checkout|purchase|pay(?:ment)?|publish|unsubscribe|confirm|authorize|oauth|login|signin/i.test(value)
}
