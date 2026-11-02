"use client";

import { formatMoney } from "@/lib/api";
import { DiscountType, InvoiceTotals, formatRate } from "@/lib/invoiceTotals";

export const KDV_RATES = [0, 1, 10, 20];

type Props = {
  calc: InvoiceTotals;
  discType: DiscountType;
  discValue: string;
  onDiscType?: (t: DiscountType) => void;
  onDiscValue?: (v: string) => void;
  /** Tüm satırlara tek tuşla KDV oranı */
  onRateAll?: (rate: string) => void;
  lineCount: number;
  /** Ödenen / tahsil edilen; verilmezse alt iki satır gizlenir */
  paid?: number;
  paidLabel?: string;
  remainingLabel?: string;
  hideTax?: boolean;
  readOnly?: boolean;
};

/** Fatura altı toplamlar (liste sonunda) — alış ve satış ekranları ortak */
export default function InvoiceTotalsFooter({
  calc,
  discType,
  discValue,
  onDiscType,
  onDiscValue,
  onRateAll,
  lineCount,
  paid,
  paidLabel = "Ödenen Tutar",
  remainingLabel = "Kalan (Cari Borç)",
  hideTax = false,
  readOnly = false,
}: Props) {
  const kalan = paid != null ? Math.max(0, Math.round((calc.total - paid) * 100) / 100) : 0;
  return (
    <div className="flex justify-end">
      <table className="text-sm w-full max-w-md bk-invoice-totals">
        <tbody>
          <tr>
            <td className="py-0.5 text-baykus-muted">Toplam Tutar</td>
            <td className="py-0.5 text-right tabular-nums">{formatMoney(calc.gross)}</td>
          </tr>
          {calc.lineDiscount > 0 && (
            <tr>
              <td className="py-0.5 text-baykus-muted">Satır İndirimleri</td>
              <td className="py-0.5 text-right tabular-nums">−{formatMoney(calc.lineDiscount)}</td>
            </tr>
          )}
          <tr>
            <td className="py-0.5 text-baykus-muted">
              {readOnly ? (
                <span>
                  Genel İndirim
                  {discType === "percent" && Number(discValue) > 0 ? ` (%${formatRate(Number(discValue))})` : ""}
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span>Genel İndirim</span>
                  <input
                    inputMode="decimal"
                    className="bk-input py-0.5 w-20 tabular-nums text-right"
                    value={discValue}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onDiscValue?.(e.target.value)}
                    aria-label="Genel indirim"
                  />
                  <div className="inline-flex rounded border border-baykus-line overflow-hidden text-xs">
                    {(["amount", "percent"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onDiscType?.(t)}
                        className={`px-2 py-0.5 ${discType === t ? "bg-baykus-600 text-white font-bold" : "bg-white"}`}
                      >
                        {t === "amount" ? "₺" : "%"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </td>
            <td className="py-0.5 text-right tabular-nums">
              {calc.generalDiscount > 0 ? `−${formatMoney(calc.generalDiscount)}` : formatMoney(0)}
            </td>
          </tr>
          <tr>
            <td className="py-0.5 text-baykus-muted">Toplam İskonto</td>
            <td className="py-0.5 text-right tabular-nums">
              {calc.totalDiscount > 0 ? `−${formatMoney(calc.totalDiscount)}` : formatMoney(0)}
            </td>
          </tr>
          <tr className="border-t border-baykus-line">
            <td className="py-0.5 text-baykus-muted">Ara Toplam (KDV Hariç)</td>
            <td className="py-0.5 text-right tabular-nums">{formatMoney(calc.taxBase)}</td>
          </tr>
          {!hideTax &&
            (calc.taxByRate.length === 0 ? (
              <tr>
                <td className="py-0.5 text-baykus-muted">Hesaplanan KDV</td>
                <td className="py-0.5 text-right tabular-nums">{formatMoney(0)}</td>
              </tr>
            ) : (
              calc.taxByRate.map((t) => (
                <tr key={t.rate}>
                  <td className="py-0.5 text-baykus-muted">
                    Hesaplanan KDV (%{formatRate(t.rate)})
                    <span className="ml-1 text-[10px]">matrah {formatMoney(t.base)}</span>
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{formatMoney(t.amount)}</td>
                </tr>
              ))
            ))}
          {!hideTax && !readOnly && onRateAll && (
            <tr>
              <td className="py-0.5 text-baykus-muted">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]">Tüm satırlara KDV</span>
                  {KDV_RATES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={!lineCount}
                      onClick={() => onRateAll(String(r))}
                      className="rounded border border-baykus-line px-1.5 py-0 text-[11px] hover:bg-slate-100 disabled:opacity-50"
                    >
                      %{r}
                    </button>
                  ))}
                </div>
              </td>
              <td />
            </tr>
          )}
          <tr className="border-t-2 border-slate-400 font-bold">
            <td className="py-1">{hideTax ? "Genel Toplam" : "Vergiler Dahil Genel Toplam"}</td>
            <td className="py-1 text-right tabular-nums text-base">{formatMoney(calc.total)}</td>
          </tr>
          {paid != null && (
            <>
              <tr>
                <td className="py-0.5 text-baykus-muted">{paidLabel}</td>
                <td className="py-0.5 text-right tabular-nums text-emerald-700">{formatMoney(paid)}</td>
              </tr>
              <tr>
                <td className="py-0.5 font-medium">{remainingLabel}</td>
                <td className={`py-0.5 text-right tabular-nums font-bold ${kalan > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {formatMoney(kalan)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
