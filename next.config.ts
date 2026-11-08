import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  // PGlite loads its WASM/data files at runtime; make sure serverless bundles carry them (demo fallback only).
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/@electric-sql/pglite/dist/{pglite,initdb}.{wasm,data,js}"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default config;
