/** Shared newest↔oldest date sorting for transaction listings. */

export type DateSortDir = "desc" | "asc";

export const DEFAULT_DATE_SORT: DateSortDir = "desc";

/** Normalize YYYY-MM-DD / ISO / TR display-ish strings for comparison. */
export function dateSortKey(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  // Already ISO / YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 19);
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return s;
}

export function compareByDate(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: DateSortDir = DEFAULT_DATE_SORT,
  tieA?: string | number | null,
  tieB?: string | number | null,
): number {
  const ka = dateSortKey(a);
  const kb = dateSortKey(b);
  let cmp = 0;
  if (ka < kb) cmp = -1;
  else if (ka > kb) cmp = 1;
  else {
    const ta = tieA == null ? "" : String(tieA);
    const tb = tieB == null ? "" : String(tieB);
    if (ta < tb) cmp = -1;
    else if (ta > tb) cmp = 1;
  }
  return dir === "desc" ? -cmp : cmp;
}

export function sortByDate<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  dir: DateSortDir = DEFAULT_DATE_SORT,
  getTie?: (row: T) => string | number | null | undefined,
): T[] {
  const copy = rows.slice();
  copy.sort((a, b) =>
    compareByDate(getDate(a), getDate(b), dir, getTie?.(a) ?? null, getTie?.(b) ?? null),
  );
  return copy;
}

export function toggleDateSort(dir: DateSortDir): DateSortDir {
  return dir === "desc" ? "asc" : "desc";
}

export function dateSortLabel(dir: DateSortDir): string {
  return dir === "desc" ? "Yeniden eskiye" : "Eskiden yeniye";
}

export function dateSortIndicator(dir: DateSortDir): string {
  return dir === "desc" ? "↓" : "↑";
}
