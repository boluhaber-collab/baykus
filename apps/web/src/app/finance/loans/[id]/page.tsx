"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const alarm = useMemo(() => {
    if (!loan) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const unpaid = (loan.installments || []).filter((i) => !i.is_paid);
    const overdue = unpaid.filter((i) => new Date(String(i.due_date)) < today);
    const dueSoon = unpaid.filter((i) => {
      const d = new Date(String(i.due_date));
      const diff = (d.getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    });
    return { overdue: overdue.length, dueSoon: dueSoon.length };
  }, [loan]);

  async function pay(installmentId: number) {
    if (!confirm("Bu taksit için Ödeme Yap — kasa/banka kaydı oluşturulsun mu?")) return;
    setBusyId(installmentId);
    setError("");
    try {
      const updated = await apiFetch<Loan>(`/api/loans/${id}/installments/${installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: method,
          post_finance: method !== "none",
        }),
      });
      setLoan(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme hatası");
    } finally {
      setBusyId(null);
    }
  }

  async function removeLoan() {
    if (!confirm("Bu kredi ve taksit planı silinsin mi?")) return;
    try {
      await apiFetch(`/api/loans/${id}`, { method: "DELETE" });
      window.location.href = "/finance/loans";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  if (!loan && !error) return <div className="text-baykus-muted text-sm">Yükleniyor…</div>;
  if (!loan) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/finance/loans">← Geri</Link>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-3">
      <Link href="/finance/loans" className="text-xs text-baykus-primary hover:underline">
        ← Krediler
      </Link>
      <div className="rounded border overflow-hidden bg-white">
        <div className="px-4 py-3 text-white font-semibold" style={{ background: "#5b78b8" }}>
          {loan.title}
        </div>
        <div className="p-4 grid sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-baykus-muted text-xs">Ödeme Hesabı / Kredi veren</span>
            <div>{loan.lender || "—"}</div>
          </div>
          <div>
            <span className="text-baykus-muted text-xs">Toplam Kredi Tutarı</span>
            <div className="font-semibold tabular-nums">{formatMoney(Number(loan.principal_amount))}</div>
          </div>
          <div>
            <span className="text-baykus-muted text-xs">Kalan Tutar</span>
            <div className="font-semibold text-emerald-700 tabular-nums">{formatMoney(Number(loan.remaining_amount))}</div>
          </div>
          <div>
            <span className="text-baykus-muted text-xs">Notlar</span>
            <div>{loan.notes || "—"}</div>
          </div>
        </div>
      </div>

      {alarm && (alarm.overdue > 0 || alarm.dueSoon > 0) && (
        <div className={`rounded px-3 py-2 text-sm ${alarm.overdue ? "bg-red-50 text-red-800 border border-red-200" : "bg-amber-50 text-amber-900 border border-amber-200"}`}>
          ⚠ Son ödeme günü alarmı: {alarm.overdue > 0 ? `${alarm.overdue} geciken taksit` : ""}
          {alarm.overdue > 0 && alarm.dueSoon > 0 ? " · " : ""}
          {alarm.dueSoon > 0 ? `${alarm.dueSoon} taksit 7 gün içinde` : ""}
        </div>
      )}

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={removeLoan} style={{ color: "#b94a48" }}>
          Krediyi Sil
        </button>
        <span className="text-baykus-muted text-xs ml-auto">Ödeme yöntemi:</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="bk-input text-xs max-w-[200px]">
          <option value="banka">Banka (çekim)</option>
          <option value="nakit">Nakit (kasa çıkış)</option>
          <option value="none">Sadece işaretle</option>
        </select>
      </div>

      <div className="rounded border bg-white overflow-hidden">
        <div className="px-3 py-2 text-white text-xs font-bold" style={{ background: "#374151" }}>
          ÖDEME TARİHLERİ / PLAN
        </div>
        <table className="bk-table text-sm">
          <thead>
            <tr>
              <th>#</th>
              <th>Tarih</th>
              <th className="text-right">Tutar</th>
              <th>Durum</th>
              <th>Ödeme</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(loan.installments || []).map((inst) => {
              const due = new Date(String(inst.due_date));
              due.setHours(0, 0, 0, 0);
              const isOverdue = !inst.is_paid && due < today;
              const isSoon = !inst.is_paid && !isOverdue && (due.getTime() - today.getTime()) / 86400000 <= 7;
              return (
                <tr
                  key={inst.id}
                  className={isOverdue ? "bg-red-50" : isSoon ? "bg-amber-50" : undefined}
                >
                  <td>{inst.sequence}</td>
                  <td>
                    {String(inst.due_date).slice(0, 10)}
                    {isOverdue && <span className="ml-1 text-[10px] text-red-700 font-bold">GECİKTİ</span>}
                    {isSoon && <span className="ml-1 text-[10px] text-amber-800 font-bold">YAKIN</span>}
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(Number(inst.amount))}</td>
                  <td>{inst.is_paid ? "Ödendi" : "Bekliyor"}</td>
                  <td className="text-xs text-baykus-muted">
                    {inst.is_paid
                      ? `${inst.payment_method || "—"} · ${inst.paid_at ? new Date(inst.paid_at).toLocaleString("tr-TR") : ""}`
                      : "—"}
                  </td>
                  <td className="text-right">
                    {!inst.is_paid && (
                      <button
                        type="button"
                        disabled={busyId === inst.id}
                        onClick={() => pay(inst.id)}
                        className="rounded text-white text-xs px-3 py-1.5"
                        style={{ background: "#6ab35a" }}
                      >
                        Ödeme Yap
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
