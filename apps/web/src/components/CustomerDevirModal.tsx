"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Props = {
  customerId: number;
  customerName: string;
  currentOpening?: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function CustomerDevirModal({
  customerId,
  customerName,
  currentOpening = 0,
  open,
  onClose,
  onSaved,
}: Props) {
  const [direction, setDirection] = useState<"borclu" | "alacakli">("borclu");
  const [amount, setAmount] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const v = Number(currentOpening || 0);
    setDirection(v >= 0 ? "borclu" : "alacakli");
    setAmount(String(Math.abs(v)));
    setError("");
  }, [open, currentOpening]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/customers/${customerId}/devir`, {
        method: "PUT",
        body: JSON.stringify({ amount: Number(amount || 0), direction }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Devir kaydı başarısız");
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
        className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 bg-teal-700 text-white rounded-t-xl">
          <h2 className="font-semibold">Devir Bakiye — {customerName}</h2>
          <button type="button" className="text-xl leading-none" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="text-xs text-slate-500 leading-relaxed">
            Bu değer yalnızca cari hesabın başlangıç bakiyesidir; geçmiş hareketleri, kasa ve banka
            kayıtlarını değiştirmez. Mevcut: {formatMoney(currentOpening)}
          </p>
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Bakiye Yönü</label>
            <select
              className="bk-input w-full"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "borclu" | "alacakli")}
            >
              <option value="borclu">Müşteri Borçlu</option>
              <option value="alacakli">Müşteri Alacaklı</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Devir Tutarı</label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              className="bk-input w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-slate-50 rounded-b-xl">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" data-baykus-save disabled={busy} className="bk-btn text-xs text-white disabled:opacity-60" style={{ background: "#0f766e" }}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
