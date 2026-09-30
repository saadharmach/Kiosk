import type { Metadata, Viewport } from "next";
import { Cairo, Figtree, Outfit } from "next/font/google";
import "./globals.css";

// Latin display and body faces, plus Cairo for Arabic glyphs. The CSS font
// stacks in globals.css fall back to Cairo per character, so mixed text works.
const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });
const figtree = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-figtree", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = { title: "Kiosk" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir are set by LocaleShell once the customer picks a language.
  return (
    <html lang="fr" dir="ltr" className={`${outfit.variable} ${figtree.variable} ${cairo.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
