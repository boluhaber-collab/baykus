"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Field,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
  inputCls,
} from "@/components/reports/ReportChrome";
import StatusFooter from "@/components/StatusFooter";
import {
  ReportResponse,
  apiFetch,
  downloadPdf,
  downloadReportCsv,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";
import { useDateSort } from "@/hooks/useDateSort";
import { formatTrDate, formatTrDatesInText, localToday, toIsoDate } from "@/lib/dates";
import { printPdfFromApi } from "@/lib/printPdf";

type SaleLine = {
  description: string;
  variant?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  line_total: number;
  line_note?: string | null;
};

type SalesRow = {
  id: string;
  order_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  status: string;
  sale_type: string;
  cancelled?: boolean;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  created_at?: string | null;
  due_date?: string | null;
  source?: string | null;
  note?: string | null;
  payment_account?: string | null;
  order_id?: number | null;
  lines: SaleLine[];
};

const SALE_TYPES = ["Perakende", "Veresiye", "Sipariş", "Cari satış"];

function monthStart(): string {
  return `${localToday().slice(0, 8)}01`;
}

function SalesReportInner() {
  const sp = useSearchParams();
  const [dateFrom, setDateFrom] = useState(
    () => toIsoDate(sp.get("start") || sp.get("date_from")) || monthStart(),
  );
  const [dateTo, setDateTo] = useState(() => toIsoDate(sp.get("end") || sp.get("date_to")) || localToday());
  const [saleType, setSaleType] = useState(sp.get("type") || "");
  const [customerId, setCustomerId] = useState(sp.get("customer_id") || "");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<ReportResponse<SalesRow> | null>(null);
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    if (saleType) p.set("type", saleType);
    if (customerId) p.set("customer_id", customerId);
    if (q) p.set("q", q);
    return p.toString();
  }, [dateFrom, dateTo, saleType, customerId, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<ReportResponse<SalesRow>>(`/api/reports/sales?${qs}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  // Müşteri listesi: seçili aralıktaki tüm satışlardan (müşteri filtresi uygulanmadan)
  useEffect(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    apiFetch<ReportResponse<SalesRow>>(`/api/reports/sales?${p.toString()}`)
      .then((res) => {
        const m = new Map<number, string>();
        for (const r of res.rows || []) if (r.customer_id && r.customer_name) m.set(r.customer_id, r.customer_name);
        setCustomers(
          [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr")),
        );
      })
      .catch(() => undefined);
  }, [dateFrom, dateTo]);

  const s = data?.summary || {};
  const byType = (s.by_type as { status: string; count: number; revenue: number }[]) || [];

  const { dir: dateDir, setDir: setDateDir, sorted: sortedRows } = useDateSort(
    data?.rows || [],
    (r) => r.created_at,
    (r) => r.id,
  );

  const allOpen = sortedRows.length > 0 && sortedRows.every((r) => !r.lines.length || open[r.id]);
  const toggleAll = () => {
    if (allOpen) setOpen({});
    else setOpen(Object.fromEntries(sortedRows.map((r) => [r.id, true])));
  };

  const run = async (fn: () => Promise<void>, msg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : msg);
    } finally {
      setBusy(false);
    }
  };

  const btn = "rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50";

  return (
    <div>
      <ReportHeader
        title="Satış raporu"
        subtitle="Tüm satışlar: perakende, veresiye, sipariş ve cari satışlar — ana sayfa ciro kartıyla aynı hesap"
        actions={
          <>
            <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm" disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
            <button
              className={btn}
              disabled={busy}
              onClick={() => run(() => printPdfFromApi(`/api/reports/sales?${qs}&format=pdf`), "Yazdırma hatası")}
            >
              Yazdır
            </button>
            <button
              className={btn}
              disabled={busy}
              onClick={() => run(() => downloadPdf(`/api/reports/sales?${qs}&format=pdf`, "satis_raporu.pdf"), "PDF hatası")}
            >
              PDF
            </button>
            <button
              className={btn}
              disabled={busy}
              onClick={() => run(() => downloadReportCsv(`/api/reports/sales?${qs}`, "satis_raporu.csv"), "CSV hatası")}
            >
              Excel / CSV
            </button>
          </>
        }
      />

      <FilterBar>
        <Field label="Başlangıç">
          <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Bitiş">
          <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Field label="Tip">
          <select className={inputCls} value={saleType} onChange={(e) => setSaleType(e.target.value)}>
            <option value="">Tümü</option>
            {SALE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Müşteri">
          <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Tümü</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ara">
          <input
            className={inputCls}
            placeholder="Belge, müşteri, ürün, açıklama…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </FilterBar>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <SummaryCards
        items={[
          { label: "Satış adedi", value: Number(s.sale_count ?? 0) },
          { label: "Ciro (iptal hariç)", value: formatMoney(Number(s.revenue ?? 0)) },
          { label: "Tahsil edilen", value: formatMoney(Number(s.paid ?? 0)) },
          { label: "Kalan tahsilat", value: formatMoney(Number(s.remaining ?? 0)) },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {byType
          .filter((b) => b.count > 0)
          .map((b) => (
            <button
              key={b.status}
              onClick={() => setSaleType(saleType === b.status ? "" : b.status)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border ${
                saleType === b.status ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white"
              }`}
            >
              {b.status}: <strong>{b.count}</strong> · {formatMoney(b.revenue)}
            </button>
          ))}
        {Number(s.cancelled_count ?? 0) > 0 && (
          <span className="text-xs text-red-600">İptal: {Number(s.cancelled_count)}</span>
        )}
        <button onClick={toggleAll} className="ml-auto text-xs text-baykus-700 hover:underline">
          {allOpen ? "Tüm kalemleri gizle" : "Tüm kalemleri göster"}
        </button>
      </div>

      <ReportTable
        headers={["", "Belge/No", "Tarih", "Müşteri", "Tip", "Tutar", "Ödenen", "Kalan", "Ödeme hesabı", "Açıklama"]}
        colSpan={10}
        dateSort={{ dir: dateDir, onChange: setDateDir }}
        empty={!loading && sortedRows.length === 0}
      >
        {sortedRows.map((r) => {
          const isOpen = !!open[r.id];
          return (
            <Fragment key={r.id}>
              <tr
                className={`border-t border-slate-100 hover:bg-slate-50 ${r.lines.length ? "cursor-pointer" : ""} ${
                  r.cancelled ? "opacity-50 line-through" : ""
                }`}
                onClick={() => r.lines.length && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
              >
                <td className="px-2 py-3 text-slate-400 w-6">{r.lines.length ? (isOpen ? "▾" : "▸") : ""}</td>
                <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                  {r.order_id ? (
                    <Link href={`/orders/${r.order_id}`} className="text-baykus-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.order_number}
                    </Link>
                  ) : (
                    r.order_number
                  )}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{formatTrDate(r.created_at)}</td>
                <td className="px-3 py-3">{r.customer_name || "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.sale_type}</span>
                  {r.source === "order" && (
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${statusBadgeClass(r.status)}`}>{r.status}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.total_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{formatMoney(r.paid_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(r.remaining_amount)}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{r.payment_account || "—"}</td>
                <td className="px-3 py-3 text-slate-500 text-xs max-w-[240px] truncate" title={r.note || ""}>
                  {formatTrDatesInText(r.note) || "—"}
                </td>
              </tr>
              {isOpen && r.lines.length > 0 && (
                <tr className="bg-slate-50/70">
                  <td />
                  <td colSpan={9} className="px-3 pb-3">
                    <table className="w-full text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="text-left py-1">Ürün</th>
                          <th className="text-left py-1">Varyant</th>
                          <th className="text-right py-1">Miktar</th>
                          <th className="text-right py-1">Birim fiyat</th>
                          <th className="text-right py-1">Toplam</th>
                          <th className="text-left py-1 pl-3">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.lines.map((ln, i) => (
                          <tr key={i} className="border-t border-slate-200">
                            <td className="py-1">{ln.description}</td>
                            <td className="py-1 text-slate-500">{ln.variant || "—"}</td>
                            <td className="py-1 text-right tabular-nums">{ln.quantity}</td>
                            <td className="py-1 text-right tabular-nums">{formatMoney(ln.unit_price)}</td>
                            <td className="py-1 text-right tabular-nums">{formatMoney(ln.line_total)}</td>
                            <td className="py-1 pl-3 text-slate-600">{ln.line_note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </ReportTable>

      <StatusFooter onRefresh={load} />
    </div>
  );
}

export default function SalesReportPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Yükleniyor…</div>}>
      <SalesReportInner />
    </Suspense>
  );
}
