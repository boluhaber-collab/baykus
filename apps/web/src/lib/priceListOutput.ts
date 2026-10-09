/**
 * Fiyat listesi çıktı kolon seçimi (Yazdır / PDF / CSV / Paylaş).
 * localStorage'da son seçim saklanır.
 */

export type PriceListColKey = "alis" | "tedarikci" | "baskisiz" | "baskili" | "nakisli";

export type PriceListShowCols = Record<PriceListColKey, boolean>;

export const PRICE_LIST_COL_DEFS: { key: PriceListColKey; label: string }[] = [
  { key: "alis", label: "Alış" },
  { key: "tedarikci", label: "Tedarikçi" },
  { key: "baskisiz", label: "Baskısız" },
  { key: "baskili", label: "Baskılı" },
  { key: "nakisli", label: "Nakışlı" },
];

const STORAGE_KEY = "baykus_price_list_output_show";

export const DEFAULT_SHOW_COLS: PriceListShowCols = {
  alis: true,
  tedarikci: true,
  baskisiz: true,
  baskili: true,
  nakisli: true,
};

/** Paylaş varsayılanı: alış + tedarikçi gizli (müşteri nüshası). */
export const SHARE_DEFAULT_SHOW_COLS: PriceListShowCols = {
  alis: false,
  tedarikci: false,
  baskisiz: true,
  baskili: true,
  nakisli: true,
};

export function loadShowCols(): PriceListShowCols {
  if (typeof window === "undefined") return { ...DEFAULT_SHOW_COLS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHOW_COLS };
    const parsed = JSON.parse(raw) as Partial<PriceListShowCols>;
    return {
      alis: parsed.alis !== false,
      tedarikci: parsed.tedarikci !== false,
      baskisiz: parsed.baskisiz !== false,
      baskili: parsed.baskili !== false,
      nakisli: parsed.nakisli !== false,
    };
  } catch {
    return { ...DEFAULT_SHOW_COLS };
  }
}

export function saveShowCols(cols: PriceListShowCols): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  } catch {
    /* ignore quota */
  }
}

export function isCustomerPreset(cols: PriceListShowCols): boolean {
  return !cols.alis && !cols.tedarikci;
}

export function applyCustomerPreset(cols: PriceListShowCols, on: boolean): PriceListShowCols {
  if (on) return { ...cols, alis: false, tedarikci: false };
  return { ...cols, alis: true, tedarikci: true };
}

/** Gizlenecek kolon anahtarları (API hide= parametresi). */
export function hideKeysFromShow(cols: PriceListShowCols): PriceListColKey[] {
  return (Object.keys(cols) as PriceListColKey[]).filter((k) => !cols[k]);
}

export function hideQuery(cols: PriceListShowCols): string {
  const hide = hideKeysFromShow(cols);
  if (hide.length === 0) return "";
  return `&hide=${hide.join(",")}`;
}

/** En az bir fiyat kolonu (baskısız/baskılı/nakışlı) görünür olmalı. */
export function ensureOnePriceCol(cols: PriceListShowCols): PriceListShowCols {
  if (cols.baskisiz || cols.baskili || cols.nakisli) return cols;
  return { ...cols, baskisiz: true };
}
