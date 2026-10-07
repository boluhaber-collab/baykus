"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loan, apiFetch, formatMoney } from "@/lib/api";
import { formatTrDate, localToday } from "@/lib/dates";
import StatusFooter from "@/components/StatusFooter";

export default function LoansPage() {
  const [items, setItems] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState({
    title: "",
    lender: "",
    principal_amount: "",
    interest_rate: "",
    start_date: localToday(),
    installment_count: "6",
    notes: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<Loan[]>("/api/loans"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return items.filter((l) => {
      const rem = Number(l.remaining_amount || 0);
      if (!showClosed && (rem <= 0.009 || l.status === "kapandı")) return false;
      return true;
    });
  }, [items, showClosed]);

  const totals = useMemo(() => {
    let remaining = 0;
    let thisMonth = 0;
    let overdue = 0;
    for (const l of items) {
      remaining += Number(l.remaining_amount || 0);
      thisMonth += Number(l.this_month_due || 0);
      overdue += Number(l.overdue_count || 0);
    }
    return { remaining, thisMonth, overdue };
  }, [items]);

  async function createLoan(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await apiFetch<Loan>("/api/loans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          lender: form.lender || null,
          principal_amount: Number(form.principal_amount),
          interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
          start_date: form.start_date,
          installment_count: Number(form.installment_count) || 1,
          notes: form.notes || null,
        }),
      });
      window.location.href = `/finance/loans/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oluşturma hatası");
    }
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-baykus-text leading-tight">Krediler</h2>
          <p className="text-xs text-baykus-muted">Finans › Krediler · ödeme planı + kasa/banka</p>
        </div>
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Borcu bitenleri de göster
        </label>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: `repeat(${totals.overdue > 0 ? 3 : 2}, minmax(0, 1fr))` }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Kalan ödemeler</div>
            <div className="bk-kpi-value truncate">{formatMoney(totals.remaining)}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">📅</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Bu ayki ödemeler</div>
            <div className="bk-kpi-value truncate">{formatMoney(totals.thisMonth)}</div>
          </div>
        </div>
        {totals.overdue > 0 && (
          <div className="bk-kpi-card" style={{ backgroundColor: "#f59e0b" }}>
            <span className="bk-kpi-icon">⚠</span>
            <div className="min-w-0 flex-1 text-right">
              <div className="bk-kpi-label">Geciken taksit</div>
              <div className="bk-kpi-value">{totals.overdue}</div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={createLoan} className="bk-card p-3 grid md:grid-cols-3 gap-2 text-sm">
        <div className="md:col-span-3 text-xs font-semibold text-baykus-muted">+ Yeni Kredi Ekle</div>
        <label>
          Başlık *
          <input required className="bk-input mt-0.5" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Kredi veren / Ödeme hesabı
          <input className="bk-input mt-0.5" value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
        </label>
        <label>
          Anapara *
          <input required type="number" step="0.01" className="bk-input mt-0.5" value={form.principal_amount} onChange={(e) => setForm({ ...form, principal_amount: e.target.value })} />
        </label>
        <label>
          Faiz %
          <input type="number" step="0.01" className="bk-input mt-0.5" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
        </label>
        <label>
          Başlangıç
          <input type="date" required className="bk-input mt-0.5" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </label>
        <label>
          Taksit sayısı
          <input type="number" min={1} max={120} className="bk-input mt-0.5" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })} />
        </label>
        <div className="md:col-span-3">
          <button type="submit" className="bk-btn text-xs text-white" style={{ background: "#6ab35a" }}>
            + Yeni Kredi Ekle
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {visible.map((l) => {
          const overdue = Number(l.overdue_count || 0) > 0;
          const nextDue = l.next_due_date ? formatTrDate(l.next_due_date) : null;
          return (
            <Link
              key={l.id}
              href={`/finance/loans/${l.id}`}
              className="flex items-center justify-between rounded px-4 py-3 text-white hover:opacity-95"
              style={{ background: overdue ? "#b94a48" : "#82bdd9", minHeight: 64 }}
            >
              <div>
                <div className="font-semibold">{l.title}</div>
                <div className="text-xs opacity-90">
                  {l.lender || "—"} · {l.paid_count}/{l.installment_count} ödendi
                  {nextDue && ` · Sonraki: ${nextDue}`}
                  {overdue ? " · ⚠ Geciken taksit" : ""}
                </div>
              </div>
              <div className="rounded bg-white text-slate-900 px-3 py-1.5 text-sm font-semibold tabular-nums">
                TL {formatMoney(Number(l.remaining_amount)).replace(" ₺", "").replace("₺", "")}
              </div>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded border bg-white py-10 text-center text-[11px] text-baykus-muted">
            Kayıtlı aktif kredi bulunmuyor.
          </div>
        )}
      </div>
      <StatusFooter onRefresh={load} />
    </div>
  );
}
