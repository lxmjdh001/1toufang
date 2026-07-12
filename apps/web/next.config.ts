import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  transpilePackages: [
    "@1toufang/shared",
    "@douyinfe/semi-ui-19",
    "@douyinfe/semi-icons",
    "@douyinfe/semi-foundation",
    "@douyinfe/semi-theme-default"
  ]
};

export default nextConfig;
