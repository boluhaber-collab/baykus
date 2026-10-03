/**
 * BizimHesap-style detailed stock filters: renk / beden / baskı / SKU / stokta / depo.
 * Shared by product list, product detail Varyant Stokları, warehouse stock, sale/purchase pickers.
 */

export type StockFilterState = {
  color: string;
  size: string;
  /**
   * Multi-select renk/beden (Stok Değeri). Empty = no extra constraint.
   * When non-empty, these replace the single `color` / `size` string.
   */
  colors: string[];
  sizes: string[];
  printType: string;
  sku: string;
  /** When true, only rows with qty > 0 (default BH behaviour). */
  inStockOnly: boolean;
  warehouse: string;
};

export const EMPTY_STOCK_FILTERS: StockFilterState = {
  color: "",
  size: "",
  colors: [],
  sizes: [],
  printType: "",
  sku: "",
  inStockOnly: true,
  warehouse: "",
};

export type StockFilterFacets = {
  colors: string[];
  sizes: string[];
  printTypes: string[];
  warehouses: string[];
};

export type StockFilterable = {
  color?: string | null;
  size?: string | null;
  print_type?: string | null;
  sku?: string | null;
  stock_qty?: number | null;
  quantity?: number | null;
  warehouse?: string | null;
  name?: string | null;
  variant_sku?: string | null;
  variant_name?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLocaleLowerCase("tr");
}

function dedupeLabels(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = (v || "").trim();
    if (!t) continue;
    const key = t.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return dedupeLabels(values).sort((a, b) => a.localeCompare(b, "tr"));
}

/** Apparel rank. null = not a letter size. Higher = larger. */
function apparelRank(token: string): number | null {
  const t = token.trim().toLocaleUpperCase("tr").replace(/[\s._-]+/g, "");
  const aliases: Record<string, string> = {
    SMALL: "S",
    MEDIUM: "M",
    LARGE: "L",
    XSMALL: "XS",
    XXSMALL: "XXS",
    XLARGE: "XL",
    XXLARGE: "XXL",
    XXXLARGE: "XXXL",
    ONESIZE: "OS",
    TEKBEDEN: "OS",
    STANDART: "OS",
    STANDARD: "OS",
    STD: "OS",
  };
  const key = aliases[t] || t;
  const table: Record<string, number> = {
    XXXS: 0,
    "3XS": 0,
    XXS: 10,
    "2XS": 10,
    XS: 20,
    S: 30,
    M: 40,
    L: 50,
    XL: 60,
    XXL: 70,
    "2XL": 70,
    XXXL: 80,
    "3XL": 80,
    XXXXL: 90,
    "4XL": 90,
    "5XL": 100,
    "6XL": 110,
    "7XL": 120,
    "8XL": 130,
    OS: 200,
  };
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  const m = key.match(/^(\d+)X[LS]$/);
  if (m) {
    const n = Number(m[1]);
    if (key.endsWith("XL")) return 50 + n * 10;
    if (key.endsWith("XS")) return 30 - n * 10;
  }
  return null;
}

function sizeSortKey(raw: string): { group: number; n: number; sub: number } {
  const t = raw.trim().toLocaleUpperCase("tr").replace(/\s+/g, "");
  const exact = apparelRank(t);
  if (exact != null) return { group: 0, n: exact, sub: 0 };
  const slash = t.split("/");
  if (slash.length === 2) {
    const a = apparelRank(slash[0]);
    const b = apparelRank(slash[1]);
    if (a != null && b != null) return { group: 0, n: a, sub: b };
  }
  const num = t.match(/^(\d+(?:[.,]\d+)?)/);
  if (num) {
    const n = parseFloat(num[1].replace(",", "."));
    return { group: 1, n: Number.isFinite(n) ? n : 0, sub: 0 };
  }
  return { group: 2, n: 0, sub: 0 };
}

/** XS…3XL, then numeric (1/2, 2, 10, 12/14), then other labels. */
export function compareSizes(a: string, b: string): number {
  const ka = sizeSortKey(a);
  const kb = sizeSortKey(b);
  if (ka.group !== kb.group) return ka.group - kb.group;
  if (ka.n !== kb.n) return ka.n - kb.n;
  if (ka.sub !== kb.sub) return ka.sub - kb.sub;
  return a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" });
}

export function sortSizes(values: Array<string | null | undefined>): string[] {
  return dedupeLabels(values).sort(compareSizes);
}

export function collectFacetOptions(rows: StockFilterable[]): StockFilterFacets {
  return {
    colors: uniqueSorted(rows.map((r) => r.color)),
    sizes: sortSizes(rows.map((r) => r.size)),
    printTypes: uniqueSorted(rows.map((r) => r.print_type)),
    warehouses: uniqueSorted(rows.map((r) => r.warehouse)),
  };
}

export function rowQty(row: StockFilterable): number {
  const q = row.stock_qty ?? row.quantity;
  return Number(q ?? 0);
}

function matchesAny(value: string | null | undefined, selected: string[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  const n = norm(value);
  return selected.some((s) => norm(s) === n);
}

export function matchesStockFilters(row: StockFilterable, f: StockFilterState): boolean {
  if (f.colors && f.colors.length > 0) {
    if (!matchesAny(row.color, f.colors)) return false;
  } else if (f.color && norm(row.color) !== norm(f.color)) return false;
  if (f.sizes && f.sizes.length > 0) {
    if (!matchesAny(row.size, f.sizes)) return false;
  } else if (f.size && norm(row.size) !== norm(f.size)) return false;
  if (f.printType && norm(row.print_type) !== norm(f.printType)) return false;
  if (f.warehouse && norm(row.warehouse) !== norm(f.warehouse)) return false;
  if (f.inStockOnly && rowQty(row) <= 0) return false;
  if (f.sku.trim()) {
    const needle = norm(f.sku);
    const hay = [row.sku, row.variant_sku, row.name, row.variant_name]
      .map(norm)
      .filter(Boolean)
      .join(" ");
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function filterStockRows<T extends StockFilterable>(
  rows: T[],
  f: StockFilterState,
): T[] {
  return rows.filter((r) => matchesStockFilters(r, f));
}

function listKey(values: string[] | undefined): string {
  return [...(values || [])].map((v) => v.trim().toLocaleLowerCase("tr")).sort().join("\0");
}

export function stockFiltersActive(f: StockFilterState, defaults?: Partial<StockFilterState>): boolean {
  const d = { ...EMPTY_STOCK_FILTERS, ...defaults };
  return (
    f.color !== d.color ||
    f.size !== d.size ||
    listKey(f.colors) !== listKey(d.colors) ||
    listKey(f.sizes) !== listKey(d.sizes) ||
    f.printType !== d.printType ||
    f.sku !== d.sku ||
    f.inStockOnly !== d.inStockOnly ||
    f.warehouse !== d.warehouse
  );
}

/** Build query params for GET /api/products (server-side list filter). */
export function stockFiltersToProductQuery(f: StockFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.color) out.color = f.color;
  if (f.size) out.size = f.size;
  if (f.printType) out.print_type = f.printType;
  if (f.sku.trim()) out.sku = f.sku.trim();
  if (f.warehouse) out.warehouse = f.warehouse;
  if (f.inStockOnly) out.in_stock_only = "true";
  return out;
}
