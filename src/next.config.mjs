import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingRoot: __dirname,
  // Prevent Next.js from bundling Supabase client — avoids 'TypeError: fetch failed'
  // in serverless functions where bundled fetch internals can break.
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/postgrest-js",
    "@supabase/ssr",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
