"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The line icons of the side menu and the top bar (24×24, stroke). */
const PATHS = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  borne: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 18h6",
  book: "M4 4h16v16H4zM4 9h16M9 9v11",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  alert: "M12 3 2 21h20zM12 10v5M12 18h.01",
  image: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM21 16l-5-5-9 9",
  cart: "M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM2 3h3l3 13h11l2-9H6",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  log: "M5 3h11l3 3v15H5zM9 10h6M9 14h6",
  store: "M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevron: "M9 6l6 6-6 6",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export interface NavItem<K extends string> { key: K; label: string; icon: IconName }
export interface NavGroup<K extends string> { label: string; items: NavItem<K>[] }

/** Something kept in this browser only (the theme, a folded menu); never required. */
function remembered(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: it just is not kept */ }
}

/** Light or dark: the system's choice until someone presses the button, then theirs (kept in this browser). */
export function ThemeButton({ label }: { label: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    setDark(set ? set === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    remember("nexborn-theme", next);
    setDark(!dark);
  };
  return (
    <button onClick={flip} aria-label={label} title={label}
      className="grid size-9 place-items-center rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) hover:bg-(--color-page)">
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

/** "AK" from "amine.k@…": the avatar's letters. */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0]!.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = base.split(" ").filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The page around every section: the petrol side menu (grouped, with icons; folds down to icons on a computer and
 * slides in on a phone), the top bar with where you are, and the content.
 */
export function AppFrame<K extends string>({
  groups, active, onPick, title, crumb, user, onSignOut, topRight, children, labels,
}: {
  groups: NavGroup<K>[];
  active: K;
  onPick: (key: K) => void;
  title: string;
  crumb: string;
  user: { name: string; detail?: string };
  onSignOut: () => void;
  /** Extra things on the right of the top bar (before the theme button). */
  topRight?: ReactNode;
  children: ReactNode;
  labels: { menu: string; fold: string; signOut: string; theme: string; close: string };
}) {
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setFolded(remembered("nexborn-nav") === "folded"); }, []);
  useEffect(() => { document.title = `${title} – NEXBORN`; }, [title]);

  const toggle = () => {
    if (window.matchMedia("(max-width: 860px)").matches) return setOpen((o) => !o);
    setFolded((f) => { remember("nexborn-nav", f ? "open" : "folded"); return !f; });
  };
  const pick = (k: K) => { onPick(k); setOpen(false); window.scrollTo(0, 0); };

  return (
    <div className="flex min-h-dvh">
      {open ? <div className="fixed inset-0 z-40 bg-[rgba(8,16,28,0.5)] min-[861px]:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}

      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-[260px] flex-col bg-(--color-nav) text-(--color-nav-ink) transition-[translate,width] duration-200 min-[861px]:sticky min-[861px]:top-0 min-[861px]:h-dvh min-[861px]:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        } ${folded ? "min-[861px]:w-[68px]" : ""}`}>
        <div className={`flex items-center gap-2.5 border-b border-(--color-nav-2) ${folded ? "min-[861px]:justify-center min-[861px]:px-2 min-[861px]:py-4" : ""} px-4 py-[18px]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexborn-logo-white.png" alt="NEXBORN" className={`h-[34px] w-auto ${folded ? "min-[861px]:hidden" : ""}`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nexborn-icon.png" alt="NEXBORN" className={`hidden w-[34px] ${folded ? "min-[861px]:block" : ""}`} />
          <button onClick={() => setOpen(false)} aria-label={labels.close} className="ms-auto grid size-8 place-items-center rounded-md text-white min-[861px]:hidden">
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label={labels.menu} className="flex-1 overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g.label}>
              <p className={`px-2.5 pt-3.5 pb-1 text-[11.5px] font-semibold text-(--color-nav-muted) ${folded ? "min-[861px]:hidden" : ""}`}>{g.label}</p>
              {g.items.map((it) => {
                const on = it.key === active;
                return (
                  <button key={it.key} onClick={() => pick(it.key)} aria-current={on ? "page" : undefined} title={folded ? it.label : undefined}
                    className={`relative flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-[9px] text-start hover:bg-(--color-nav-2) hover:text-white ${
                      on ? "bg-(--color-nav-2) text-white before:absolute before:inset-y-2 before:-start-2 before:w-[3px] before:rounded-sm before:bg-(--color-accent)" : ""
                    } ${folded ? "min-[861px]:justify-center" : ""}`}>
                    <Icon name={it.icon} />
                    <span className={folded ? "min-[861px]:hidden" : ""}>{it.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`flex items-center gap-2.5 border-t border-(--color-nav-2) p-3 text-[13px] text-white ${folded ? "min-[861px]:justify-center" : ""}`}>
          <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-(--color-accent) font-bold text-[#052b38]">{initials(user.name)}</span>
          <div className={`min-w-0 ${folded ? "min-[861px]:hidden" : ""}`}>
            <p className="truncate font-bold">{user.name}</p>
            {user.detail ? <p className="truncate text-[12px] text-(--color-nav-ink)">{user.detail}</p> : null}
            <button onClick={onSignOut} className="text-[#6fe3d3] hover:underline">{labels.signOut}</button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3.5 border-b border-(--color-line) bg-(--color-surface) px-6 py-2.5 max-[860px]:px-3.5">
          <button onClick={toggle} aria-label={labels.fold} title={labels.fold}
            className="grid size-9 place-items-center rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) hover:bg-(--color-page)">
            <Icon name="menu" />
          </button>
          <div className="min-w-0">
            <p className="text-[12.5px] text-(--color-ink-muted)">{crumb}</p>
            <h1 className="truncate text-[19px] leading-tight font-bold">{title}</h1>
          </div>
          <div className="flex-1" />
          {topRight}
          <ThemeButton label={labels.theme} />
        </header>
        <main className="w-full max-w-[1300px] p-6 max-[860px]:p-3.5">{children}</main>
      </div>
    </div>
  );
}

/** "il y a 4 min" / "4 min ago": how long since a moment, in words. */
export function since(iso: string, locale: "fr" | "en", now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}
