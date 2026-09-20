"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loan, apiFetch, formatMoney } from "@/lib/api";

export default function LoansPage() {
  const [items, setItems] = useState<Loan[]>([]);
  const [error, setError] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [form, setForm] = useState({
    title: "",
    lender: "",
    principal_amount: "",
    interest_rate: "",
    start_date: new Date().toISOString().slice(0, 10),
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Krediler</h2>
          <p className="text-xs text-baykus-muted">Finans › Krediler · ödeme planı + kasa/banka</p>
        </div>
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Borcu bitenleri de göster
        </label>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 justify-end">
        <div className="rounded border bg-white px-4 py-2 text-center min-w-[160px]">
          <div className="text-[10px] text-emerald-700 font-semibold">KALAN ÖDEMELER</div>
          <div className="text-lg font-bold text-emerald-600 tabular-nums">{formatMoney(totals.remaining)}</div>
        </div>
        <div className="rounded border bg-white px-4 py-2 text-center min-w-[160px]">
          <div className="text-[10px] text-red-700 font-semibold">BU AYKİ ÖDEMELER</div>
          <div className="text-lg font-bold text-red-600 tabular-nums">{formatMoney(totals.thisMonth)}</div>
        </div>
        {totals.overdue > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-center min-w-[120px]">
            <div className="text-[10px] text-amber-800 font-semibold">GECİKEN TAKSİT</div>
            <div className="text-lg font-bold text-amber-900">{totals.overdue}</div>
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
          const nextDue = l.next_due_date ? String(l.next_due_date).slice(0, 10) : null;
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
          <div className="rounded border bg-white py-10 text-center text-sm text-baykus-muted">
            Kayıtlı aktif kredi bulunmuyor.
          </div>
        )}
      </div>
    </div>
  );
}
