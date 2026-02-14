import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@super/auth", "@super/db"]
};

export default nextConfig;
