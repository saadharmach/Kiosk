import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Kiosk" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir are set by LocaleShell once the customer picks a language.
  return (
    <html lang="fr" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
