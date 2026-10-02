/**
 * Which borne is this machine? The restaurant opens each machine's browser at an address ending in ?borne=K2. The code is
 * kept on the machine, so a reload (or opening the plain address) is still that borne. Pure, so each case can be tested.
 */

const CODE = /^[A-Za-z0-9]{1,4}$/;

/** The code to use now: the one in the address if there is a valid one, else the remembered one, else none. */
export function chooseBorne(search: string, remembered: string | null): string | null {
  const given = new URLSearchParams(search).get("borne");
  if (given !== null && CODE.test(given.trim())) return given.trim().toUpperCase();
  return remembered !== null && CODE.test(remembered) ? remembered.toUpperCase() : null;
}

const key = (slug: string) => `kiosk.borne.${slug}`;

/** Reads the borne for this machine and remembers it. Storage can be blocked or full: then it simply is not remembered. */
export function readBorne(slug: string, search: string): string | null {
  let remembered: string | null = null;
  try { remembered = window.localStorage.getItem(key(slug)); } catch { /* private mode */ }
  const borne = chooseBorne(search, remembered);
  try {
    if (borne) window.localStorage.setItem(key(slug), borne);
  } catch { /* not remembered, still works for this visit */ }
  return borne;
}
