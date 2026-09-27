/**
 * Extra BizimHesap-parity fields (KDV/ÖTV/birim/e-ticaret) live in product.description
 * as an HTML comment JSON block — no Alembic. User-facing text stays above the marker.
 */

export type ProductMeta = {
  sales_unit?: string;
  is_ecommerce?: boolean;
  sale_vat?: number | null;
  sale_vat_included?: boolean;
  purchase_vat?: number | null;
  purchase_vat_included?: boolean;
  purchase_discount?: number | null;
  oiv_rate?: string | null;
  otv_type?: string | null;
  purchase_otv_rate?: number | null;
  linked_product_ids?: number[];
};

const MARKER = "<!--baykus-product-meta:";
const END = "-->";

export function parseProductDescription(raw: string | null | undefined): {
  text: string;
  meta: ProductMeta;
} {
  const src = raw || "";
  const i = src.indexOf(MARKER);
  if (i < 0) return { text: src.trimEnd(), meta: {} };
  const text = src.slice(0, i).trimEnd();
  const rest = src.slice(i + MARKER.length);
  const j = rest.indexOf(END);
  if (j < 0) return { text: src.trimEnd(), meta: {} };
  try {
    const meta = JSON.parse(rest.slice(0, j).trim()) as ProductMeta;
    return { text, meta: meta && typeof meta === "object" ? meta : {} };
  } catch {
    return { text, meta: {} };
  }
}

export function serializeProductDescription(text: string, meta: ProductMeta): string | null {
  const clean = (text || "").trim();
  const useful =
    meta.sales_unit ||
    meta.is_ecommerce ||
    meta.sale_vat != null ||
    meta.sale_vat_included ||
    meta.purchase_vat != null ||
    meta.purchase_vat_included ||
    meta.purchase_discount != null ||
    meta.oiv_rate ||
    meta.otv_type ||
    meta.purchase_otv_rate != null ||
    (meta.linked_product_ids && meta.linked_product_ids.length > 0);
  if (!useful) return clean || null;
  return `${clean}\n\n${MARKER}${JSON.stringify(meta)}${END}`;
}

export const SALES_UNITS = ["Adet", "Kg", "Metre", "Paket", "Koli", "Litre", "Takım", "Saat"];
export const VAT_RATES = [0, 1, 10, 20];
