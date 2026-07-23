import { resolve } from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve("../../")
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/docs/intro",
        permanent: true
      }
    ]
  }
}

export default nextConfig
