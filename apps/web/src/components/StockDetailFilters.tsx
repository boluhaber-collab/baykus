"use client";

import {
  EMPTY_STOCK_FILTERS,
  StockFilterFacets,
  StockFilterState,
  stockFiltersActive,
} from "@/lib/stockFilters";

type Props = {
  value: StockFilterState;
  onChange: (next: StockFilterState) => void;
  facets: StockFilterFacets;
  /** Hide warehouse dropdown (e.g. already inside a warehouse view). */
  hideWarehouse?: boolean;
  /** Compact layout for modals / pickers. */
  compact?: boolean;
  /** Override default inStockOnly when deciding if "Temizle" is useful. */
  defaults?: Partial<StockFilterState>;
  className?: string;
};

const selectCls = "bk-input max-w-[140px] text-xs";
const selectClsCompact = "bk-input w-full text-xs py-1";

export default function StockDetailFilters({
  value,
  onChange,
  facets,
  hideWarehouse = false,
  compact = false,
  defaults,
  className = "",
}: Props) {
  const patch = (p: Partial<StockFilterState>) => onChange({ ...value, ...p });
  const active = stockFiltersActive(value, defaults);
  const sel = compact ? selectClsCompact : selectCls;

  const fields = (
    <>
      <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
        {!compact && <span className="sr-only">Renk</span>}
        {compact && <span>Renk</span>}
        <select
          className={sel}
          value={value.color}
          onChange={(e) => patch({ color: e.target.value })}
          aria-label="Renk"
        >
          <option value="">Tüm renkler</option>
          {facets.colors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
        {compact && <span>Beden</span>}
        <select
          className={sel}
          value={value.size}
          onChange={(e) => patch({ size: e.target.value })}
          aria-label="Beden"
        >
          <option value="">Tüm bedenler</option>
          {facets.sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
        {compact && <span>Baskı</span>}
        <select
          className={sel}
          value={value.printType}
          onChange={(e) => patch({ printType: e.target.value })}
          aria-label="Baskı"
        >
          <option value="">Tüm baskılar</option>
          {facets.printTypes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {!hideWarehouse && (
        <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
          {compact && <span>Depo</span>}
          <select
            className={sel}
            value={value.warehouse}
            onChange={(e) => patch({ warehouse: e.target.value })}
            aria-label="Depo"
          >
            <option value="">Tüm depolar</option>
            {facets.warehouses.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
        {compact ? <span>SKU</span> : <span className="whitespace-nowrap">SKU:</span>}
        <input
          className={compact ? "bk-input w-full text-xs py-1" : "bk-input max-w-[140px] text-xs"}
          value={value.sku}
          onChange={(e) => patch({ sku: e.target.value })}
          placeholder="SKU / ad…"
          aria-label="SKU"
        />
      </label>
      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none whitespace-nowrap">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={value.inStockOnly}
          onChange={(e) => patch({ inStockOnly: e.target.checked })}
        />
        Stokta olanlar
      </label>
      {active && (
        <button
          type="button"
          className="bk-btn bk-btn-ghost text-xs"
          onClick={() =>
            onChange({
              ...EMPTY_STOCK_FILTERS,
              inStockOnly: defaults?.inStockOnly ?? EMPTY_STOCK_FILTERS.inStockOnly,
              ...Object.fromEntries(
                Object.entries(defaults || {}).filter(([, v]) => v !== undefined),
              ),
            } as StockFilterState)
          }
        >
          Temizle
        </button>
      )}
    </>
  );

  if (compact) {
    return (
      <div className={`grid grid-cols-2 gap-2 p-2 border-b bg-slate-50/80 ${className}`}>{fields}</div>
    );
  }

  return (
    <div className={`bk-filter-bar ${className}`} data-stock-detail-filters>
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1">
        Detaylı
      </span>
      {fields}
    </div>
  );
}
