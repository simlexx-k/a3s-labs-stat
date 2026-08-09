import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  experimental: {
    useTypeScriptCli: false,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
