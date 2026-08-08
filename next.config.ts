import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  allowedDevOrigins: ['loralee-preperusal-kole.ngrok-free.dev'],
};

export default nextConfig;
