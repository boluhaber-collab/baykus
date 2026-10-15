import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Sol alttaki "N" geliştirici rozeti menü/altbilgi üstüne biniyordu
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
