import path from "path"
import type { NextConfig } from "next"

const API_SERVER = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3004"

const nextConfig: NextConfig = {
  transpilePackages: ["@super/db-terminal", "@super/auth-terminal"],
  turbopack: {
    root: path.resolve(__dirname, "../../.."),
  },
  async rewrites() {
    // Dev-only proxies: `next dev` ignores vercel.json, so keep the same
    // explicit terminal API groups that production routes to Render.
    const groups = ["auth", "billing", "webhooks", "user", "conversations", "reviews", "ai", "tools"]
    return groups.map((group) => ({
      source: `/api/${group}/:path*`,
      destination: `${API_SERVER}/api/${group}/:path*`,
    }))
  },
}

export default nextConfig;
