"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BankAccount,
  CashRegister,
  Loan,
  LoanInstallment,
  apiFetch,
  formatMoney,
} from "@/lib/api";

type EditState = {
  installmentId: number;
  due_date: string;
  amount: string;
  notes: string;
  payment_method: string;
  cash_register_id: string;
  bank_account_id: string;
  is_paid: boolean;
};

export default function LoanDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [cashRegs, setCashRegs] = useState<CashRegister[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [method, setMethod] = useState("banka");
  const [cashRegisterId, setCashRegisterId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [loanData, regs, bankList] = await Promise.all([
        apiFetch<Loan>(`/api/loans/${id}`),
        apiFetch<CashRegister[]>("/api/finance/cash?active=true"),
        apiFetch<BankAccount[]>("/api/finance/banks?active=true"),
      ]);
      const activeRegs = regs.filter((r) => r.is_active !== false);
      const activeBanks = bankList.filter((b) => b.is_active !== false);
      setLoan(loanData);
      setCashRegs(activeRegs);
      setBanks(activeBanks);
      setCashRegisterId((prev) => prev || (activeRegs[0] ? String(activeRegs[0].id) : ""));
      setBankAccountId((prev) => prev || (activeBanks[0] ? String(activeBanks[0].id) : ""));
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

  function accountLabel(inst: LoanInstallment): string {
    if (!inst.is_paid) return "—";
    if (inst.payment_method === "banka") {
      return inst.bank_account_name || "Banka";
    }
    if (inst.payment_method === "nakit") {
      return inst.cash_register_name || "Kasa";
    }
    if (inst.payment_method === "none") return "Sadece işaret";
    return inst.payment_method || "—";
  }

  async function pay(installmentId: number) {
    if (method === "banka" && !bankAccountId) {
      setError("Banka ödemesi için hesap seçin");
      return;
    }
    if (method === "nakit" && !cashRegisterId && cashRegs.length > 0) {
      setError("Nakit ödeme için kasa seçin");
      return;
    }
    const accHint =
      method === "banka"
        ? banks.find((b) => String(b.id) === bankAccountId)?.name || "banka"
        : method === "nakit"
          ? cashRegs.find((r) => String(r.id) === cashRegisterId)?.name || "kasa"
          : "işaret";
    if (!confirm(`Bu taksit için Ödeme Yap — ${accHint} kaydı oluşturulsun mu?`)) return;
    setBusyId(installmentId);
    setError("");
    try {
      const updated = await apiFetch<Loan>(`/api/loans/${id}/installments/${installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: method,
          post_finance: method !== "none",
          cash_register_id:
            method === "nakit" && cashRegisterId ? Number(cashRegisterId) : null,
          bank_account_id:
            method === "banka" && bankAccountId ? Number(bankAccountId) : null,
        }),
      });
      setLoan(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme hatası");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelPayment(inst: LoanInstallment) {
    if (
      !confirm(
        `Taksit #${inst.sequence} ödemesi iptal edilsin mi?\nBağlı kasa/banka hareketleri tersine çevrilecek.`,
      )
    ) {
      return;
    }
    setBusyId(inst.id);
    setError("");
    try {
      const updated = await apiFetch<Loan>(
        `/api/loans/${id}/installments/${inst.id}/cancel`,
        { method: "POST" },
      );
      setLoan(updated);
      if (edit?.installmentId === inst.id) setEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İptal hatası");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(inst: LoanInstallment) {
    setEdit({
      installmentId: inst.id,
      due_date: String(inst.due_date).slice(0, 10),
      amount: String(inst.amount),
      notes: inst.notes || "",
      payment_method: inst.payment_method || (inst.is_paid ? "banka" : "none"),
      cash_register_id: inst.cash_register_id
        ? String(inst.cash_register_id)
        : cashRegisterId,
      bank_account_id: inst.bank_account_id ? String(inst.bank_account_id) : bankAccountId,
      is_paid: inst.is_paid,
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusyId(edit.installmentId);
    setError("");
    try {
      const body: Record<string, unknown> = {
        due_date: edit.due_date,
        amount: Number(edit.amount),
        notes: edit.notes || null,
      };
      if (edit.is_paid) {
        if (edit.payment_method === "banka" && !edit.bank_account_id) {
          setError("Banka ödemesi için hesap seçin");
          setBusyId(null);
          return;
        }
        if (edit.payment_method === "nakit" && !edit.cash_register_id && cashRegs.length > 0) {
          setError("Nakit ödeme için kasa seçin");
          setBusyId(null);
          return;
        }
        body.payment_method = edit.payment_method;
        body.post_finance = edit.payment_method !== "none";
        body.cash_register_id =
          edit.payment_method === "nakit" && edit.cash_register_id
            ? Number(edit.cash_register_id)
            : null;
        body.bank_account_id =
          edit.payment_method === "banka" && edit.bank_account_id
            ? Number(edit.bank_account_id)
            : null;
      }
      const updated = await apiFetch<Loan>(
        `/api/loans/${id}/installments/${edit.installmentId}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
      setLoan(updated);
      setEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Düzenleme hatası");
    } finally {
      setBusyId(null);
    }
  }

  async function removeLoan() {
    if (!confirm("Bu kredi ve taksit planı silinsin mi? Ödenmiş kasa/banka hareketleri de silinir."))
      return;
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
        <span className="text-baykus-muted text-xs ml-auto">Ödeme hesabı:</span>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="bk-input text-xs max-w-[160px]">
          <option value="banka">Banka</option>
          <option value="nakit">Nakit (kasa)</option>
          <option value="none">Sadece işaretle</option>
        </select>
        {method === "nakit" ? (
          <select
            value={cashRegisterId}
            onChange={(e) => setCashRegisterId(e.target.value)}
            className="bk-input text-xs max-w-[220px]"
          >
            <option value="">Kasa seçin</option>
            {cashRegs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {typeof r.balance === "number" ? ` (${formatMoney(r.balance)})` : ""}
              </option>
            ))}
          </select>
        ) : method === "banka" ? (
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="bk-input text-xs max-w-[240px]"
          >
            <option value="">Banka / hesap seçin</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {(b.account_type ? `${b.account_type} · ` : "") + b.name}
                {typeof b.balance === "number" ? ` (${formatMoney(b.balance)})` : ""}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {edit && (
        <form
          onSubmit={saveEdit}
          className="rounded border bg-white p-3 grid sm:grid-cols-2 gap-2 text-sm"
        >
          <div className="sm:col-span-2 text-xs font-semibold text-baykus-muted">
            Taksit düzenle #{(loan.installments || []).find((i) => i.id === edit.installmentId)?.sequence}
            {edit.is_paid ? " (ödeme + kasa/banka)" : " (plan)"}
          </div>
          <label className="text-xs">
            <span className="text-baykus-muted">Vade</span>
            <input
              type="date"
              className="bk-input mt-1 w-full"
              value={edit.due_date}
              onChange={(e) => setEdit({ ...edit, due_date: e.target.value })}
              required
            />
          </label>
          <label className="text-xs">
            <span className="text-baykus-muted">Tutar</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="bk-input mt-1 w-full"
              value={edit.amount}
              onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
              required
            />
          </label>
          {edit.is_paid && (
            <>
              <label className="text-xs">
                <span className="text-baykus-muted">Ödeme yöntemi</span>
                <select
                  className="bk-input mt-1 w-full"
                  value={edit.payment_method}
                  onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}
                >
                  <option value="banka">Banka</option>
                  <option value="nakit">Nakit (kasa)</option>
                  <option value="none">Sadece işaretle</option>
                </select>
              </label>
              {edit.payment_method === "nakit" ? (
                <label className="text-xs">
                  <span className="text-baykus-muted">Kasa</span>
                  <select
                    className="bk-input mt-1 w-full"
                    value={edit.cash_register_id}
                    onChange={(e) => setEdit({ ...edit, cash_register_id: e.target.value })}
                    required
                  >
                    <option value="">Kasa seçin</option>
                    {cashRegs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : edit.payment_method === "banka" ? (
                <label className="text-xs">
                  <span className="text-baykus-muted">Banka / hesap</span>
                  <select
                    className="bk-input mt-1 w-full"
                    value={edit.bank_account_id}
                    onChange={(e) => setEdit({ ...edit, bank_account_id: e.target.value })}
                    required
                  >
                    <option value="">Hesap seçin</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {(b.account_type ? `${b.account_type} · ` : "") + b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div />
              )}
            </>
          )}
          <label className="text-xs sm:col-span-2">
            <span className="text-baykus-muted">Not</span>
            <input
              className="bk-input mt-1 w-full"
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={busyId === edit.installmentId}
              className="rounded text-white text-xs px-3 py-1.5"
              style={{ background: "#5b78b8" }}
            >
              Kaydet
            </button>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() => setEdit(null)}
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

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
              <th>Hesap</th>
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
                  <td className="text-xs font-medium">{accountLabel(inst)}</td>
                  <td className="text-xs text-baykus-muted">
                    {inst.is_paid
                      ? `${inst.payment_method || "—"} · ${inst.paid_at ? new Date(inst.paid_at).toLocaleString("tr-TR") : ""}`
                      : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {!inst.is_paid ? (
                      <button
                        type="button"
                        disabled={busyId === inst.id}
                        onClick={() => pay(inst.id)}
                        className="rounded text-white text-xs px-3 py-1.5"
                        style={{ background: "#6ab35a" }}
                      >
                        Ödeme Yap
                      </button>
                    ) : (
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={busyId === inst.id}
                          onClick={() => startEdit(inst)}
                          className="rounded border border-slate-300 text-xs px-2 py-1"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          disabled={busyId === inst.id}
                          onClick={() => cancelPayment(inst)}
                          className="rounded border border-red-200 text-red-700 text-xs px-2 py-1"
                        >
                          İptal Et
                        </button>
                      </span>
                    )}
                    {!inst.is_paid && (
                      <button
                        type="button"
                        disabled={busyId === inst.id}
                        onClick={() => startEdit(inst)}
                        className="ml-1 rounded border border-slate-300 text-xs px-2 py-1"
                      >
                        Düzenle
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
