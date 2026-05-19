import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['encoding', 'pino-pretty', '@firebase/firestore', 'firebase'],
  turbopack: {},
};

export default nextConfig;