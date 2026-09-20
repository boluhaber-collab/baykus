"use client";

import { FormEvent, useEffect, useState } from "react";
import { BankAccount, FinanceSummary, apiFetch, formatMoney } from "@/lib/api";

type Props = {
  customerId: number;
  customerName: string;
  defaultAmount?: number;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const PAY_TYPES = ["Nakit", "EFT", "Kredi Kartı", "Diğer"] as const;

export default function CustomerTahsilatModal({
  customerId,
  customerName,
  defaultAmount = 0,
  open,
  onClose,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState("");
  const [payType, setPayType] = useState<(typeof PAY_TYPES)[number]>("Nakit");
  const [bankId, setBankId] = useState("");
  const [note, setNote] = useState("Müşteri tahsilatı");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [applyOrders, setApplyOrders] = useState(true);
  const [second, setSecond] = useState(false);
  const [amount2, setAmount2] = useState("");
  const [payType2, setPayType2] = useState<(typeof PAY_TYPES)[number]>("Nakit");
  const [bankId2, setBankId2] = useState("");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount > 0 ? String(defaultAmount) : "");
    setPayType("Nakit");
    setBankId("");
    setNote("Müşteri tahsilatı");
    setDate(new Date().toISOString().slice(0, 10));
    setApplyOrders(true);
    setSecond(false);
    setAmount2("");
    setError("");
    apiFetch<FinanceSummary>("/api/finance/summary")
      .then((s) => {
        const list = s.bank_accounts || [];
        setBanks(list);
        if (list[0]) setBankId(String(list[0].id));
      })
      .catch(() => setBanks([]));
  }, [open, defaultAmount]);

  const needsBank = payType === "EFT" || payType === "Kredi Kartı";
  const needsBank2 = payType2 === "EFT" || payType2 === "Kredi Kartı";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        amount: Number(amount),
        payment_type: payType,
        bank_account_id: needsBank && bankId ? Number(bankId) : null,
        note: note.trim() || "Müşteri tahsilatı",
        movement_date: date || null,
        apply_to_open_orders: applyOrders,
      };
      if (second && Number(amount2) > 0) {
        body.amount2 = Number(amount2);
        body.payment_type2 = payType2;
        body.bank_account_id2 = needsBank2 && bankId2 ? Number(bankId2) : null;
      }
      const res = await apiFetch<{ message: string }>(`/api/customers/${customerId}/tahsilat`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSaved(res.message || "Tahsilat kaydedildi.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tahsilat kaydı başarısız");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-3" role="dialog">
      <form
        onSubmit={submit}
        data-baykus-save
        data-baykus-escape-ignore
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 bg-emerald-700 text-white rounded-t-xl">
          <h2 className="font-semibold">Tahsilat Al — {customerName}</h2>
          <button type="button" className="text-white/90 hover:text-white text-xl leading-none" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2">{error}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tutar</label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className="bk-input w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
              {defaultAmount > 0 && (
                <div className="text-[11px] text-slate-400 mt-0.5">Açık bakiye: {formatMoney(defaultAmount)}</div>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tarih</label>
              <input type="date" className="bk-input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ödeme Türü</label>
              <select
                className="bk-input w-full"
                value={payType}
                onChange={(e) => setPayType(e.target.value as (typeof PAY_TYPES)[number])}
              >
                {PAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Banka</label>
              <select
                className="bk-input w-full"
                value={bankId}
                disabled={!needsBank}
                onChange={(e) => setBankId(e.target.value)}
              >
                <option value="">—</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Açıklama</label>
            <input className="bk-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={applyOrders} onChange={(e) => setApplyOrders(e.target.checked)} />
            Açık sipariş kalan ödemelerine işle (FIFO)
          </label>

          {!second ? (
            <button
              type="button"
              className="rounded bg-slate-600 text-white text-xs px-3 py-1.5"
              onClick={() => setSecond(true)}
            >
              + İkinci Ödeme Ekle
            </button>
          ) : (
            <div className="rounded border border-slate-200 p-3 space-y-2 bg-slate-50">
              <div className="flex justify-between items-center">
                <div className="font-semibold text-xs">İkinci Ödeme</div>
                <button type="button" className="text-xs text-slate-500" onClick={() => setSecond(false)}>
                  − İkinci Ödemeyi Kaldır
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="bk-input"
                  placeholder="Tutar"
                  value={amount2}
                  onChange={(e) => setAmount2(e.target.value)}
                />
                <select
                  className="bk-input"
                  value={payType2}
                  onChange={(e) => setPayType2(e.target.value as (typeof PAY_TYPES)[number])}
                >
                  {PAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  className="bk-input"
                  value={bankId2}
                  disabled={!needsBank2}
                  onChange={(e) => setBankId2(e.target.value)}
                >
                  <option value="">Banka</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-slate-50 rounded-b-xl">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose}>
            Kapat
          </button>
          <button type="submit" data-baykus-save disabled={busy} className="bk-btn bk-btn-primary text-xs disabled:opacity-60">
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
