import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@fontsource/noto-sans-sc", "pdfkit", "pptxgenjs"],
};

export default nextConfig;
