import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@super/auth", "@super/db", "@super/db-terminal", "@super/claude-sdk", "@super/embeddings-sdk"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
  },
  turbopack: {
    root: resolve("../../")
  },
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/dashboard/settings",
        permanent: true,
      },
      {
        source: "/settings/:path*",
        destination: "/dashboard/settings/:path*",
        permanent: true,
      },
      {
        source: "/providers",
        destination: "/dashboard/providers",
        permanent: true,
      },
      {
        source: "/providers/:path*",
        destination: "/dashboard/providers/:path*",
        permanent: true,
      },
      {
        source: "/logs",
        destination: "/dashboard/logs",
        permanent: true,
      },
      {
        source: "/logs/:path*",
        destination: "/dashboard/logs/:path*",
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
