import type { Metadata } from "next";
import { Suspense } from "react";
import AcceptInvite from "@/components/AcceptInvite";

// The link carries a credential: tell the browser not to pass the address on to anything else, and keep it out of search.
export const metadata: Metadata = { title: "Choose your password", referrer: "no-referrer", robots: { index: false, follow: false } };

export default function Page() {
  return <Suspense fallback={null}><AcceptInvite /></Suspense>;
}
