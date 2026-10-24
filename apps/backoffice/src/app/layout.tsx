import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/state/auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ weight: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = { title: "NEXBORN – Back-office" };

// The theme picked with the button is set before the page paints, so it never flashes the other one.
const THEME = `try{var t=localStorage.getItem("nexborn-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
