"use client";

import {
  PRICE_LIST_COL_DEFS,
  PriceListColKey,
  PriceListShowCols,
  applyCustomerPreset,
  ensureOnePriceCol,
  isCustomerPreset,
} from "@/lib/priceListOutput";

type Props = {
  value: PriceListShowCols;
  onChange: (next: PriceListShowCols) => void;
  /** Paylaş: alış/tedarikçi kilitli gizli */
  shareMode?: boolean;
  className?: string;
  compact?: boolean;
};

/** Çıktıda göster — kolon seçimi + Müşteri nüshası kısayolu. */
export default function PriceListOutputOptions({
  value,
  onChange,
  shareMode = false,
  className = "",
  compact = false,
}: Props) {
  function setCol(key: PriceListColKey, on: boolean) {
    if (shareMode && (key === "alis" || key === "tedarikci")) return;
    let next = { ...value, [key]: on };
    next = ensureOnePriceCol(next);
    onChange(next);
  }

  function setCustomer(on: boolean) {
    if (shareMode) return;
    onChange(applyCustomerPreset(value, on));
  }

  const customerOn = isCustomerPreset(value);
  const defs = shareMode
    ? PRICE_LIST_COL_DEFS.filter((d) => d.key !== "alis" && d.key !== "tedarikci")
    : PRICE_LIST_COL_DEFS;

  return (
    <div
      className={`rounded border bg-slate-50/80 px-2.5 py-2 space-y-1.5 ${className}`}
      title="Yazdır / PDF / CSV / Paylaş çıktısında hangi kolonlar görünsün"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`font-semibold text-slate-700 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          Çıktıda göster
        </span>
        {defs.map((d) => (
          <label
            key={d.key}
            className={`inline-flex items-center gap-1 text-slate-700 ${compact ? "text-[10px]" : "text-[11px]"}`}
          >
            <input type="checkbox" checked={value[d.key]} onChange={(e) => setCol(d.key, e.target.checked)} />
            {d.label}
          </label>
        ))}
        {!shareMode && (
          <label
            className={`inline-flex items-center gap-1 text-rose-800 font-medium border-l border-slate-200 pl-3 ml-0.5 ${
              compact ? "text-[10px]" : "text-[11px]"
            }`}
            title="Alış fiyatı ve tedarikçiyi gizler (müşteriye verilecek nüsha)"
          >
            <input type="checkbox" checked={customerOn} onChange={(e) => setCustomer(e.target.checked)} />
            Müşteri nüshası
          </label>
        )}
      </div>
      {shareMode && (
        <div className="text-[10px] text-slate-500">Alış fiyatı ve tedarikçi paylaşımda gönderilmez.</div>
      )}
    </div>
  );
}
