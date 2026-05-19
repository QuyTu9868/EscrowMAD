import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
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
    if (isServer) {
      config.externals = [...(config.externals || []), 'firebase', 'firebase/app', 'firebase/firestore'];
    }
    return config;
  },
};

export default nextConfig;