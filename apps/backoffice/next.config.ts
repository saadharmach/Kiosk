import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3005";
// The deploy builds plain files (NEXT_OUTPUT=export): nginx serves them and passes /api to the API itself,
// so the dev-only rewrite below is left out (a static export cannot have one).
const isExport = process.env.NEXT_OUTPUT === "export";

const config: NextConfig = isExport
  ? { reactStrictMode: true, output: "export" }
  : {
      reactStrictMode: true,
      // Dev only: lets other devices on the local network open this dev server by the PC's address (192.168.x.x).
      allowedDevOrigins: ["192.168.*.*"],
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
      },
    };

export default config;
