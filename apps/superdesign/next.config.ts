import { resolve } from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve("../../"),
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/projects",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
