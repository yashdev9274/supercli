import { request } from "node:https"

export function brokerRequest(origin: string) {
  const url = new URL(origin)
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Broker must be an HTTPS origin")
  return (endpoint: "poll" | "claim" | "start" | "complete", proof: object): Promise<unknown> => new Promise((resolve, reject) => {
    const data = JSON.stringify(proof)
    if (Buffer.byteLength(data) > 70_000) return reject(new Error("Broker request too large"))
    const req = request(new URL(`/api/nova/desktop-control/device/${endpoint}`, url), {
      method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) },
    }, response => {
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > 70_000) { response.destroy(); reject(new Error("Broker response too large")); return }
        chunks.push(chunk)
      })
      response.on("error", () => reject(new Error("Broker response failed")))
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error("Broker request denied"))
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))) } catch { reject(new Error("Invalid broker response")) }
      })
    })
    const timer = setTimeout(() => req.destroy(new Error("Broker request timed out")), 10_000)
    req.on("close", () => clearTimeout(timer))
    req.on("error", () => reject(new Error("Broker request failed")))
    req.end(data)
  })
}
