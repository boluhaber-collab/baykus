"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";
import SplitPaymentRows, {
  SplitPaymentRow,
  rowsSum,
  rowsToPayload,
} from "@/components/SplitPaymentRows";

type Props = {
  customerId: number;
  customerName: string;
  defaultAmount?: number;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function CustomerTahsilatModal({
  customerId,
  customerName,
  defaultAmount = 0,
  open,
  onClose,
  onSaved,
}: Props) {
  const [note, setNote] = useState("Müşteri tahsilatı");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [applyOrders, setApplyOrders] = useState(true);
  const [payRows, setPayRows] = useState<SplitPaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setNote("Müşteri tahsilatı");
    setDate(new Date().toISOString().slice(0, 10));
    setApplyOrders(true);
    setError("");
    setPayRows([]);
    setResetKey((k) => k + 1);
  }, [open, defaultAmount]);

  const total = rowsSum(payRows);
  const expected = defaultAmount > 0 ? defaultAmount : total;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payments = rowsToPayload(payRows);
      if (!payments.length) {
        throw new Error("En az bir kasa/hesap satırı girin.");
      }
      const res = await apiFetch<{ message: string }>(`/api/customers/${customerId}/tahsilat`, {
        method: "POST",
        body: JSON.stringify({
          amount: total,
          note: note.trim() || "Müşteri tahsilatı",
          movement_date: date || null,
          apply_to_open_orders: applyOrders,
          payments,
        }),
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
              <label className="block text-xs text-slate-500 mb-1">Tarih</label>
              <input type="date" className="bk-input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="text-xs text-slate-500 self-end pb-2">
              {defaultAmount > 0 && <>Açık bakiye: <strong>{formatMoney(defaultAmount)}</strong></>}
              {total > 0 && (
                <>
                  {defaultAmount > 0 ? " · " : ""}
                  Tahsil: <strong className="text-emerald-700">{formatMoney(total)}</strong>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5">Kasa / Hesap · Tahsilat</div>
            <SplitPaymentRows
              key={resetKey}
              expectedTotal={expected > 0 ? expected : 0}
              mode="tahsilat"
              autoFill={defaultAmount > 0}
              onChange={setPayRows}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Açıklama</label>
            <input className="bk-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={applyOrders} onChange={(e) => setApplyOrders(e.target.checked)} />
            Açık sipariş kalan ödemelerine işle (FIFO)
          </label>
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
