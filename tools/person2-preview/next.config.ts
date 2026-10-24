import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  // The preview consumes the actual Person 2 files, without copying or changing shared config.
  turbopack: { root: path.resolve(__dirname, "../.."), resolveAlias: { react: path.resolve(__dirname, "node_modules/react"), "react-dom": path.resolve(__dirname, "node_modules/react-dom") } },
  webpack(config) {
    config.resolve.alias.react = path.resolve(__dirname, "node_modules/react");
    config.resolve.alias["react-dom"] = path.resolve(__dirname, "node_modules/react-dom");
    return config;
  },
  async headers() { return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Content-Type-Options", value: "nosniff" }] }]; },
};
export default config;
