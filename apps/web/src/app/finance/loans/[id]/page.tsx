"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loan, apiFetch, formatMoney } from "@/lib/api";

export default function LoanDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [method, setMethod] = useState("banka");

  const load = useCallback(async () => {
    setError("");
    try {
      setLoan(await apiFetch<Loan>(`/api/loans/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  async function pay(installmentId: number) {
    if (!confirm("Bu taksiti ödenmiş işaretlemek istiyor musunuz?")) return;
    setBusyId(installmentId);
    setError("");
    try {
      const updated = await apiFetch<Loan>(
        `/api/loans/${id}/installments/${installmentId}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            payment_method: method,
            post_finance: method !== "none",
          }),
        },
      );
      setLoan(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme hatası");
    } finally {
      setBusyId(null);
    }
  }

  if (!loan && !error) return <div className="text-slate-500">Yükleniyor…</div>;
  if (!loan) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/finance/loans">← Geri</Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/finance/loans" className="text-sm text-baykus-600 hover:underline">
        ← Kredi / Taksit
      </Link>
      <h1 className="text-2xl font-bold mt-2">{loan.title}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {loan.lender || "—"} · {loan.status} · {loan.installment_count} taksit
      </p>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Anapara</div>
          <div className="text-lg font-semibold">{formatMoney(Number(loan.principal_amount))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Ödenen</div>
          <div className="text-lg font-semibold">{formatMoney(Number(loan.paid_amount))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Kalan</div>
          <div className="text-lg font-semibold">{formatMoney(Number(loan.remaining_amount))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Faiz %</div>
          <div className="text-lg font-semibold">{loan.interest_rate ?? "—"}</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Ödeme yöntemi:</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded-lg border px-3 py-1.5"
        >
          <option value="banka">Banka (çekim kaydı)</option>
          <option value="nakit">Nakit (kasa çıkış)</option>
          <option value="none">Sadece işaretle (finans yok)</option>
        </select>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Vade</th>
              <th className="px-4 py-3">Tutar</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Ödeme</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(loan.installments || []).map((inst) => (
              <tr key={inst.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{inst.sequence}</td>
                <td className="px-4 py-3">{String(inst.due_date).slice(0, 10)}</td>
                <td className="px-4 py-3">{formatMoney(Number(inst.amount))}</td>
                <td className="px-4 py-3">{inst.is_paid ? "Ödendi" : "Bekliyor"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {inst.is_paid
                    ? `${inst.payment_method || "—"} · ${inst.paid_at ? new Date(inst.paid_at).toLocaleString("tr-TR") : ""}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {!inst.is_paid && (
                    <button
                      type="button"
                      disabled={busyId === inst.id}
                      onClick={() => pay(inst.id)}
                      className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs"
                    >
                      Öde
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
