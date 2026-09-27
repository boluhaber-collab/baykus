/**
 * BizimHesap import stores opaque GUIDs as product/variant SKU (BH:… / BHV:…)
 * for matching on re-import. Hide those from list/select UI; keep real human SKUs.
 */

export function isImportSku(sku: string | null | undefined): boolean {
  if (!sku) return false;
  const s = sku.trim().toUpperCase();
  return s.startsWith("BH:") || s.startsWith("BHV:");
}

/** Human-facing SKU for chips/columns; null when import GUID or empty. */
export function displaySku(sku: string | null | undefined): string | null {
  const t = (sku || "").trim();
  if (!t || isImportSku(t)) return null;
  return t;
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
