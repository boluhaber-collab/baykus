"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { downloadPdf } from "@/lib/api";

export type StatementPdfDateModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  partyName: string;
  /** Path template or builder — receives ISO dates (empty string = omit). */
  buildUrl: (from: string, to: string) => string;
  filename: string;
  onDone?: (message: string) => void;
  onError?: (message: string) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export default function StatementPdfDateModal({
  open,
  onClose,
  title,
  partyName,
  buildUrl,
  filename,
  onDone,
  onError,
}: StatementPdfDateModalProps) {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFrom(monthStartIso());
    setTo(todayIso());
    setError("");
    setBusy(false);
  }, [open]);

  const rangeLabel = useMemo(() => {
    if (!from && !to) return "Tüm hareketler (tarih filtresi yok)";
    if (from && to) return `${from} → ${to}`;
    if (from) return `${from} → …`;
    return `… → ${to}`;
  }, [from, to]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (from && to && from > to) {
      setError("Başlangıç, bitişten sonra olamaz.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await downloadPdf(buildUrl(from, to), filename);
      onDone?.(
        !from && !to
          ? "Hesap ekstresi PDF indirildi (tüm hareketler)."
          : `Hesap ekstresi PDF indirildi (${rangeLabel}).`,
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF hatası";
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-3" role="dialog">
      <form
        onSubmit={submit}
        data-baykus-escape-ignore
        className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 bg-slate-800 text-white rounded-t-xl">
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            <p className="text-[11px] text-white/70 truncate max-w-[280px]">{partyName}</p>
          </div>
          <button type="button" className="text-white/90 hover:text-white text-xl leading-none" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-xs">{error}</div>}
          <p className="text-xs text-slate-500">
            Tarih aralığı seçin (BizimHesap Detaylı Ekstre gibi). Boş bırakırsanız tüm hareketler iner.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Başlangıç</label>
              <input
                type="date"
                className="bk-input w-full"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Bitiş</label>
              <input
                type="date"
                className="bk-input w-full"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-[11px]"
              onClick={() => {
                setFrom(monthStartIso());
                setTo(todayIso());
              }}
            >
              Bu ay
            </button>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-[11px]"
              onClick={() => {
                const t = todayIso();
                setFrom(t);
                setTo(t);
              }}
            >
              Bugün
            </button>
            <button
              type="button"
              className="bk-btn bk-btn-ghost text-[11px]"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Tümü
            </button>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Dönem: <strong className="tabular-nums">{rangeLabel}</strong>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 bg-slate-50 rounded-b-xl">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose} disabled={busy}>
            İptal
          </button>
          <button type="submit" className="bk-btn bk-btn-primary text-xs disabled:opacity-60" disabled={busy}>
            {busy ? "İndiriliyor…" : "PDF indir"}
          </button>
        </div>
      </form>
    </div>
  );
}
