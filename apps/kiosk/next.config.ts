import path from "node:path";
import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

const config: NextConfig = {
  reactStrictMode: true,
  // Dev only: lets other devices on the local network open this dev server by the PC's address (192.168.x.x).
  allowedDevOrigins: ["192.168.*.*"],
  // The deploy builds a self-contained server (NEXT_OUTPUT=standalone). The workspace root is the tracing root,
  // so the shared packages' files are found.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { output: "standalone" as const, outputFileTracingRoot: path.join(process.cwd(), "../..") }
    : {}),
  // In production nginx sends /api to the API before a request ever reaches this server; this is for dev.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default config;
