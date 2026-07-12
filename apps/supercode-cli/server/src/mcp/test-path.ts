const pkgDir = new URL("../../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js", import.meta.url)
console.log("url:", pkgDir.href)
const mod = await import(pkgDir.href)
console.log("StdioClientTransport:", typeof mod.StdioClientTransport)
