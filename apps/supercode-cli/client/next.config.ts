import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@super/db-terminal", "@super/auth-terminal"],
};

export default nextConfig;
