import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@super/auth", "@super/db", "@super/db-terminal", "@super/claude-sdk", "@super/embeddings-sdk"],
  turbopack: {
    root: resolve("../../")
  }
};

export default nextConfig;
