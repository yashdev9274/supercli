import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@super/auth", "@super/db", "@super/claude-sdk", "@super/embeddings-sdk"]
};

export default nextConfig;
