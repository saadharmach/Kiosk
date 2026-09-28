import type { Metadata } from "next";
import { AuthProvider } from "@/state/auth";
import "./globals.css";

export const metadata: Metadata = { title: "Kiosk back office" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}