"use client";

import { useState, type ReactNode } from "react";
import { useBrand } from "@/state/brand";

/** Stroke icons (24 grid). One place, so screens never inline SVG paths. */
const PATHS = {
  chevron: ["m9 18 6-6-6-6"],
  back: ["m15 18-6-6 6-6"],
  globe: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"],
  chef: ["M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z", "M6 17h12"],
  bag: ["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z", "M3 6h18", "M16 10a4 4 0 0 1-8 0"],
  eatIn: ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],
  truck: ["M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9", "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14", "M19 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", "M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"],
  hand: ["M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2", "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2", "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8", "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"],
  plus: ["M5 12h14", "M12 5v14"],
  edit: ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"],
  minus: ["M5 12h14"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  check: ["M20 6 9 17l-5-5"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  info: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M12 16v-4", "M12 8h.01"],
  warning: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  card: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M2 10h20"],
  backspace: ["M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z", "m18 9-6 6", "m12 9 6 6"],
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  camera: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z", "M12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-8", strokeWidth = 2 }: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** The restaurant's mark: its uploaded logo, or a chef's hat until it has one (or if it will not load). */
export function LogoTile({ className = "size-15 rounded-2xl", iconClass = "size-8" }: {
  className?: string;
  iconClass?: string;
}) {
  const { logoUrl } = useBrand();
  const [failed, setFailed] = useState<string | null>(null);
  const logo = logoUrl && failed !== logoUrl ? logoUrl : null;
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden ${
      logo ? "bg-white" : "bg-(--color-brand) text-(--color-brand-ink)"
    } ${className}`}>
      {logo ? (
        // The restaurant name sits beside it, so the image itself is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" onError={() => setFailed(logo)} className="size-full object-contain p-[8%]" />
      ) : (
        <Icon name="chef" className={iconClass} strokeWidth={1.7} />
      )}
    </span>
  );
}
