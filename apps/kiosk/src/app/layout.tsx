import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Cairo, Manrope } from "next/font/google";
import "./globals.css";

// Direction B: Barlow Condensed ExtraBold for titles, prices and action buttons (big headlines that fit a tall narrow
// screen); Manrope for labels and descriptions; Cairo for Arabic glyphs. The CSS font stacks in globals.css fall back
// to Cairo per character, so mixed text works.
const barlow = Barlow_Condensed({ weight: ["600", "700", "800"], subsets: ["latin", "latin-ext"], variable: "--font-barlow", display: "swap" });
const manrope = Manrope({ weight: ["500", "600", "700", "800"], subsets: ["latin", "latin-ext"], variable: "--font-manrope", display: "swap" });
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = { title: "Kiosk" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#24211f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir are set by LocaleShell once the customer picks a language.
  return (
    <html lang="fr" dir="ltr" className={`${barlow.variable} ${manrope.variable} ${cairo.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
