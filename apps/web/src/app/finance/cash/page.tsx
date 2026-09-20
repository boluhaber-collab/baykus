"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CASH_TYPE_LABELS,
  CashDailyPanel,
  CashMovement,
  apiFetch,
  formatMoney,
  statusBadgeClass,
} from "@/lib/api";

const CASH_TYPES = [
  { value: "tahsilat", label: "Tahsilat" },
  { value: "odeme", label: "Ödeme" },
  { value: "gider", label: "Gider" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashPage() {
  const [panel, setPanel] = useState<CashDailyPanel | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);

  const [formType, setFormType] = useState("tahsilat");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayStr);
  const [formCategory, setFormCategory] = useState("");
  const [formNote, setFormNote] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
      setPanel(await apiFetch<CashDailyPanel>(`/api/finance/cash/daily?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch<CashMovement>("/api/finance/cash/movements", {
        method: "POST",
        body: JSON.stringify({
          movement_type: formType,
          amount: Number(formAmount),
          movement_date: formDate || null,
          category: formCategory.trim() || null,
          note: formNote.trim() || null,
        }),
      });
      setFormAmount("");
      setFormCategory("");
      setFormNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const s = panel?.summary;
  const main = panel?.cash_register;

  const cards = s
    ? [
        { label: "Sipariş", value: String(s.order_count) },
        { label: "Ciro", value: formatMoney(s.revenue) },
        { label: "Tahsilat/Kapora", value: formatMoney(s.collections) },
        { label: "Kalan Alacak", value: formatMoney(s.remaining) },
        { label: "Maliyet", value: formatMoney(s.cost) },
        { label: "Brüt Kâr", value: formatMoney(s.gross_profit) },
        { label: "Gider", value: formatMoney(s.expense) },
        { label: "Net Kazanç", value: formatMoney(s.net_profit) },
        { label: "Teklif", value: String(s.quote_count) },
        { label: "Teslim Edilen", value: String(s.delivered_count) },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Günlük Kasa</h2>
          <p className="text-xs text-baykus-muted">Finans › Günlük Kasa · masaüstü özet + hareketler</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="bk-btn bk-btn-ghost text-xs">
            Finans özeti
          </Link>
          <Link href="/finance/banks" className="bk-btn bk-btn-ghost text-xs">
            Hesaplarım
          </Link>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-filter-bar items-end">
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Başlangıç</span>
          <input type="date" className="bk-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="text-xs">
          <span className="text-baykus-muted block mb-0.5">Bitiş</span>
          <input type="date" className="bk-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button
          type="button"
          className="bk-btn bk-btn-ghost text-xs"
          onClick={() => {
            const t = todayStr();
            setFromDate(t);
            setToDate(t);
          }}
        >
          Bugün
        </button>
        {main && (
          <div className="ml-auto rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs">
            <span className="text-emerald-800">{main.name} · Açılış </span>
            <strong className="tabular-nums">{formatMoney(Number(main.opening_balance))}</strong>
            <span className="text-emerald-800"> · Bakiye </span>
            <strong className="tabular-nums text-emerald-900">{formatMoney(Number(main.balance))}</strong>
          </div>
        )}
      </div>

      <fieldset className="rounded border border-slate-200 bg-white px-3 py-2">
        <legend className="px-1 text-xs font-semibold text-slate-600">Kasa Özeti</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {cards.map((c) => (
            <div key={c.label} className="rounded bg-slate-50 px-2.5 py-1.5">
              <div className="text-[10px] text-baykus-muted">{c.label}</div>
              <div className="text-sm font-bold tabular-nums">{c.value}</div>
            </div>
          ))}
        </div>
        {s && (
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-600">
            <span>
              Tarih Aralığı: <strong>{fromDate}</strong> — <strong>{toDate}</strong>
            </span>
            <span>
              En Çok Satılan Ürün: <strong>{s.top_product}</strong>
            </span>
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 lg:grid-cols-4">
        <form onSubmit={onSubmit} className="bk-card p-3 space-y-2 text-sm lg:col-span-1">
          <h3 className="font-semibold text-sm">Yeni kasa hareketi</h3>
          <select className="bk-input" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {CASH_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Tutar ₺"
            className="bk-input"
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
          />
          <input type="date" className="bk-input" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          <input
            className="bk-input"
            placeholder="Kategori"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          />
          <textarea
            className="bk-input"
            rows={2}
            placeholder="Not"
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
          />
          <button type="submit" disabled={busy} className="bk-btn bk-btn-primary w-full text-xs">
            {busy ? "…" : "Kaydet"}
          </button>
        </form>

        <div className="lg:col-span-3 space-y-3">
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Sipariş No</th>
                  <th>Belge</th>
                  <th>Tarih</th>
                  <th>Müşteri</th>
                  <th>Ürün</th>
                  <th className="text-right">Adet</th>
                  <th className="text-right">Toplam</th>
                  <th className="text-right">Kapora</th>
                  <th className="text-right">Kalan</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {(panel?.orders || []).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={o.href} className="text-baykus-primary hover:underline font-medium">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="text-xs">{o.document_type}</td>
                    <td className="text-xs">{o.date || "—"}</td>
                    <td>
                      <div className="text-sm">{o.customer_name || "—"}</div>
                      <div className="text-[10px] text-baykus-muted">{o.customer_phone || ""}</div>
                    </td>
                    <td className="text-xs max-w-[180px] truncate">{o.products || "—"}</td>
                    <td className="text-right tabular-nums">{o.qty}</td>
                    <td className="text-right tabular-nums">{formatMoney(o.total_amount)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{formatMoney(o.deposit_amount)}</td>
                    <td className="text-right tabular-nums text-amber-700">{formatMoney(o.remaining_amount)}</td>
                    <td>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${statusBadgeClass(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {(panel?.orders || []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-baykus-muted py-6">
                      Aralıkta sipariş yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <fieldset className="rounded border border-slate-200 bg-white px-2 py-2">
            <legend className="px-1 text-xs font-semibold text-slate-600">Kasa / Banka Hareketleri</legend>
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kaynak</th>
                    <th>Hesap</th>
                    <th>İşlem</th>
                    <th>Açıklama</th>
                    <th className="text-right">Giriş</th>
                    <th className="text-right">Çıkış</th>
                    <th>Ödeme Türü</th>
                  </tr>
                </thead>
                <tbody>
                  {(panel?.movements || []).map((m, i) => (
                    <tr key={`${m.source}-${m.date}-${i}`}>
                      <td className="text-xs whitespace-nowrap">{m.date}</td>
                      <td className="text-xs">{m.source}</td>
                      <td className="text-xs">{m.account}</td>
                      <td className="text-xs">{CASH_TYPE_LABELS[m.movement_type] || m.movement_type}</td>
                      <td className="text-xs text-baykus-muted max-w-[200px] truncate">{m.note || "—"}</td>
                      <td className="text-right tabular-nums text-emerald-700">
                        {m.in_amount ? formatMoney(m.in_amount) : ""}
                      </td>
                      <td className="text-right tabular-nums text-red-700">
                        {m.out_amount ? formatMoney(m.out_amount) : ""}
                      </td>
                      <td className="text-xs">{m.payment_type}</td>
                    </tr>
                  ))}
                  {(panel?.movements || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-baykus-muted py-6">
                        Hareket yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
