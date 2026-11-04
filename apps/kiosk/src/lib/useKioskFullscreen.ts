"use client";

import { useEffect } from "react";

/**
 * Makes the page a kiosk: edge to edge, and no long-press menus.
 *
 * Chrome only allows fullscreen from a user gesture, so the first touch enters it,
 * and a touch after someone leaves it (Esc, a system swipe) enters it again.
 * `?fullscreen=0` turns fullscreen off, for development on a desktop browser.
 *
 * This does not lock the device: Chrome has to be launched in kiosk mode for that
 * (the --kiosk flag), which no web page can do for itself.
 */
export function useKioskFullscreen() {
  useEffect(() => {
    // A long press must never open a "save image / open in new tab" menu.
    const blockMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", blockMenu);
    window.addEventListener("dragstart", blockMenu);

    const disabled = new URLSearchParams(location.search).get("fullscreen") === "0";
    const enter = () => {
      if (document.fullscreenElement) return;
      // A refused request (no gesture, policy) is fine: the next touch tries again.
      document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
    };
    if (!disabled && document.fullscreenEnabled) window.addEventListener("pointerup", enter);

    return () => {
      window.removeEventListener("contextmenu", blockMenu);
      window.removeEventListener("dragstart", blockMenu);
      window.removeEventListener("pointerup", enter);
    };
  }, []);
}
