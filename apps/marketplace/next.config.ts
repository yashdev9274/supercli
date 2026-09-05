import { resolve } from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@super/db"],
  turbopack: {
    root: resolve("../../"),
  },
}

export default nextConfig
