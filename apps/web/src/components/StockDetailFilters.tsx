"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_STOCK_FILTERS,
  StockFilterFacets,
  StockFilterState,
  stockFiltersActive,
  uniqueSorted,
} from "@/lib/stockFilters";

type Props = {
  value: StockFilterState;
  onChange: (next: StockFilterState) => void;
  facets: StockFilterFacets;
  /** Hide warehouse dropdown (e.g. already inside a warehouse view). */
  hideWarehouse?: boolean;
  /** Compact layout for modals / pickers. */
  compact?: boolean;
  /** Renk and Beden become checkbox multi-selects (Stok Değeri). */
  multiColorSize?: boolean;
  /** Override default inStockOnly when deciding if "Temizle" is useful. */
  defaults?: Partial<StockFilterState>;
  className?: string;
};

function MultiCheckSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  allLabel: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const opts = uniqueSorted([...options, ...selected]);
  const summary =
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} seçili`;

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }

  return (
    <div ref={ref} className={`relative ${className.includes("w-full") ? "w-full" : ""}`}>
      <button
        type="button"
        className={`${className} text-left truncate`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </button>
      {open && (
        <div
          className="absolute z-40 mt-1 min-w-[12rem] max-h-64 overflow-auto rounded border border-slate-200 bg-white shadow-lg text-xs text-slate-700"
          role="listbox"
          aria-label={label}
          aria-multiselectable
        >
          <div className="sticky top-0 flex gap-2 border-b border-slate-100 bg-white px-2 py-1.5">
            <button
              type="button"
              className="text-[11px] font-semibold text-sky-700 hover:underline"
              onClick={() => onChange([...opts])}
            >
              Tümünü seç
            </button>
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-500 hover:underline"
              onClick={() => onChange([])}
            >
              Temizle
            </button>
          </div>
          {opts.length === 0 && <div className="px-2 py-2 text-slate-400">Seçenek yok</div>}
          {opts.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const selectCls = "bk-input max-w-[140px] text-xs";
const selectClsCompact = "bk-input w-full text-xs py-1";

export default function StockDetailFilters({
  value,
  onChange,
  facets,
  hideWarehouse = false,
  compact = false,
  multiColorSize = false,
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
        {multiColorSize ? (
          <MultiCheckSelect
            label="Renk"
            allLabel="Tüm renkler"
            options={facets.colors}
            selected={value.colors || []}
            onChange={(colors) => patch({ colors, color: "" })}
            className={sel}
          />
        ) : (
          <select
            className={sel}
            value={value.color}
            onChange={(e) => patch({ color: e.target.value, colors: [] })}
            aria-label="Renk"
          >
            <option value="">Tüm renkler</option>
            {facets.colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className={`flex ${compact ? "flex-col gap-0.5" : "items-center gap-1"} text-xs text-slate-500`}>
        {compact && <span>Beden</span>}
        {multiColorSize ? (
          <MultiCheckSelect
            label="Beden"
            allLabel="Tüm bedenler"
            options={facets.sizes}
            selected={value.sizes || []}
            onChange={(sizes) => patch({ sizes, size: "" })}
            className={sel}
          />
        ) : (
          <select
            className={sel}
            value={value.size}
            onChange={(e) => patch({ size: e.target.value, sizes: [] })}
            aria-label="Beden"
          >
            <option value="">Tüm bedenler</option>
            {facets.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
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
