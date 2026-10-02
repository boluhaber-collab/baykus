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
