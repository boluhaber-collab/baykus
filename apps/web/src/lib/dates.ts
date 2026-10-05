/** Date helpers: ISO YYYY-MM-DD for APIs/storage; dd.mm.yyyy for UI display. */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** ISO date (optionally with time) embedded in free text / notes. */
const ISO_DATE_IN_TEXT_RE = /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;

/** Local calendar YYYY-MM-DD (Europe/Istanbul on user machines; avoids UTC toISOString off-by-one). */
export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Noon local as ISO-like datetime so paid_at .date() stays on the chosen calendar day. */
export function dateToPaidAt(dateStr: string | null | undefined): string | null {
  const d = (dateStr || "").trim();
  if (!d) return null;
  return `${d}T12:00:00`;
}

/** Strip to YYYY-MM-DD for <input type="date"> / API filters (keep ISO internally). */
export function toIsoDate(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

/**
 * ISO / date-like → GG.AA.YYYY (dd.mm.yyyy) for program-wide UI display.
 * Already-TR strings pass through; empty → "—".
 */
export function formatTrDate(iso: string | null | undefined, empty = "—"): string {
  if (iso == null) return empty;
  const raw = String(iso).trim();
  if (!raw) return empty;
  // Already DD.MM.YYYY
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(raw)) {
    const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
    return raw;
  }
  const s = raw.slice(0, 10);
  const m = ISO_DATE_RE.exec(s);
  if (!m) return raw;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * ISO datetime → GG.AA.YYYY SS:DD (local wall-clock from the string when possible).
 * Date-only values omit time.
 */
export function formatTrDateTime(iso: string | null | undefined, empty = "—"): string {
  if (iso == null) return empty;
  const raw = String(iso).trim();
  if (!raw) return empty;
  const datePart = formatTrDate(raw.slice(0, 10), "");
  if (!datePart) return empty;
  // Prefer HH:mm from the string (avoids UTC shift on "...Z" when we only need clock face)
  const tm = raw.match(/[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!tm) return datePart;
  // If Z / offset present, use local Date for correct local time
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${formatTrDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        empty,
      )} ${hh}:${mm}`;
    }
  }
  return `${datePart} ${tm[1]}:${tm[2]}`;
}

/** Replace ISO dates/datetimes inside free text (Açıklama, notes, period labels). */
export function formatTrDatesInText(text: string | null | undefined): string {
  if (text == null) return "";
  const s = String(text);
  if (!s) return s;
  return s.replace(ISO_DATE_IN_TEXT_RE, (full, y, m, d) => {
    const date = `${d}.${m}.${y}`;
    const tm = full.match(/[T\s](\d{2}):(\d{2})/);
    if (tm) return `${date} ${tm[1]}:${tm[2]}`;
    return date;
  });
}

/** Period label: "05.10.2026 → 31.10.2026" (ISO inputs OK). */
export function formatTrPeriod(
  from: string | null | undefined,
  to: string | null | undefined,
  allLabel = "Tüm hareketler",
): string {
  const a = from ? formatTrDate(from, "") : "";
  const b = to ? formatTrDate(to, "") : "";
  if (a && b) return `${a} → ${b}`;
  if (a) return `${a} → …`;
  if (b) return `… → ${b}`;
  return allLabel;
}
