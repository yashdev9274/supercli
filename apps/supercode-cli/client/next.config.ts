import path from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@super/db-terminal", "@super/auth-terminal"],
  turbopack: {
    root: path.resolve(__dirname, "../../.."),
  },
}

export default nextConfig;
