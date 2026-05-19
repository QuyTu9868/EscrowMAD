import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['encoding', 'pino-pretty'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        encoding: false,
        'pino-pretty': false,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;