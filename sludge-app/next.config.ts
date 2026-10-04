import type { NextConfig } from "next";

const config: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // the starter's launch page lived at /create; the vat calls it /brew
  async redirects() {
    return [{ source: "/create", destination: "/brew", permanent: true }];
  },
};

export default config;
