import type { Metadata } from "next";
import { AuthProvider } from "@/state/auth";
// Plus Jakarta Sans from the project's own files, not downloaded from Google at build time: Google's answer for this
// font changed and broke the build.
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "./globals.css";

export const metadata: Metadata = { title: "NEXBORN – Platform admin" };

// The theme picked with the button is set before the page paints, so it never flashes the other one.
const THEME = `try{var t=localStorage.getItem("nexborn-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
