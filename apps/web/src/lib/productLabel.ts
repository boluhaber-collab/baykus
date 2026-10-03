/**
 * BizimHesap import stores opaque GUIDs as product/variant SKU (BH:… / BHV:…)
 * for matching on re-import. Hide those from list/select UI; keep real human SKUs.
 */

const HEX_GUID_RE = /^[A-Fa-f0-9]{16,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * BizimHesap sync key stored as party code or product/variant SKU.
 * BH:… / BHV:… / bare hex GUID. Not a human-facing code.
 */
export function isBhSyncCode(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = value.trim();
  if (!s) return false;
  const u = s.toUpperCase();
  if (
    u.startsWith("BH:") ||
    u.startsWith("BHV:") ||
    u.startsWith("BH_IMPORT") ||
    u.startsWith("BH_FROM_STOCK")
  ) {
    return true;
  }
  return HEX_GUID_RE.test(s) || UUID_RE.test(s);
}

export function isImportSku(sku: string | null | undefined): boolean {
  return isBhSyncCode(sku);
}

/** Human-facing SKU/code for chips/columns; null when import GUID or empty. */
export function displaySku(sku: string | null | undefined): string | null {
  const t = (sku || "").trim();
  if (!t || isBhSyncCode(t)) return null;
  return t;
}

/** Party code alias of displaySku (hide BH: GUIDs, keep M-011 / T-010). */
export function displayCode(code: string | null | undefined): string | null {
  return displaySku(code);
}

/** Input value: blank while the stored key is a BH sync code (state itself unchanged). */
export function maskBhSyncValue(value: string | null | undefined): string {
  return displaySku(value) || "";
}

/**
 * Product option / picker label.
 * BH: SKU → name only; otherwise "sku — name" (or custom sep).
 */
export function productOptionLabel(
  sku: string | null | undefined,
  name: string,
  opts?: { sep?: string; suffix?: string },
): string {
  const human = displaySku(sku);
  const sep = opts?.sep ?? " — ";
  const base = human ? `${human}${sep}${name}` : name;
  return opts?.suffix ? `${base}${opts.suffix}` : base;
}
