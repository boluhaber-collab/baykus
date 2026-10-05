"use client";

import { useEffect, useState } from "react";
import type { PriceList } from "@/lib/api";
import {
  canShareFiles,
  loadPriceList,
  priceListShareText,
  savePriceListPdf,
  shareNativePdf,
} from "@/lib/priceListActions";

type Props = {
  listId: number;
  listName: string;
  onClose: () => void;
};

/** Fiyat listesi Paylaş penceresi — müşteri nüshası (alış fiyatı ve tedarikçi gizli). */
export default function PriceListShareDialog({ listId, listName, onClose }: Props) {
  const [pl, setPl] = useState<PriceList | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [nativeOk, setNativeOk] = useState(false);

  useEffect(() => {
    setNativeOk(canShareFiles());
    loadPriceList(listId)
      .then(setPl)
      .catch((e) => setError(e instanceof Error ? e.message : "Liste yüklenemedi"));
  }, [listId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = pl ? priceListShareText(pl) : "";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paylaşım hatası");
    } finally {
      setBusy(false);
    }
  }

  function waLink(body: string) {
    let digits = phone.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "90" + digits.slice(1);
    else if (digits.length === 10 && digits.startsWith("5")) digits = "90" + digits;
    return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Fiyat listesini paylaş"
      >
        <div className="bg-[#be123c] text-white px-4 py-3">
          <div className="font-bold">Paylaş — {listName}</div>
          <div className="text-xs text-rose-100">Müşteri nüshası: alış fiyatı ve tedarikçi gönderilmez.</div>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-xs">{error}</div>}
          {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-xs">{msg}</div>}

          {nativeOk && (
            <button
              type="button"
              disabled={busy}
              className="bk-btn w-full text-white text-xs"
              style={{ background: "#0f766e" }}
              onClick={() =>
                run(async () => {
                  const ok = await shareNativePdf(listId, listName);
                  if (ok) setMsg("✓ PDF paylaşıldı");
                })
              }
            >
              PDF&apos;i paylaş (WhatsApp, e-posta, …)
            </button>
          )}

          <div className="rounded border p-3 space-y-2">
            <div className="font-semibold text-xs">WhatsApp</div>
            <label className="block">
              <span className="text-[11px] text-baykus-muted">Telefon (boş bırakılırsa kişi WhatsApp&apos;ta seçilir)</span>
              <input
                className="bk-input"
                placeholder="05xx xxx xx xx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !pl}
                className="bk-btn text-white text-xs"
                style={{ background: "#16a34a" }}
                onClick={() =>
                  run(async () => {
                    window.open(waLink(text), "_blank", "noopener");
                    setMsg("WhatsApp açıldı — fiyatlar mesaj olarak hazır.");
                  })
                }
              >
                Fiyatları mesaj olarak gönder
              </button>
              <button
                type="button"
                disabled={busy}
                className="bk-btn bk-btn-ghost text-xs"
                onClick={() =>
                  run(async () => {
                    await savePriceListPdf(listId, listName, true);
                    window.open(waLink(`Fiyat Listesi — ${listName} (PDF ektedir)`), "_blank", "noopener");
                    setMsg("PDF indirildi — WhatsApp'ta ataç simgesiyle ekleyip gönderin.");
                  })
                }
              >
                PDF indir + WhatsApp aç
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !pl}
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(text);
                  setMsg("✓ Fiyat listesi metni panoya kopyalandı");
                })
              }
            >
              Metni kopyala
            </button>
            <button
              type="button"
              disabled={busy || !pl}
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() =>
                run(async () => {
                  await savePriceListPdf(listId, listName, true);
                  const subject = encodeURIComponent(`Fiyat Listesi — ${listName}`);
                  const body = encodeURIComponent(text.replace(/\*/g, "") + "\n\n(PDF ektedir)");
                  window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  setMsg("PDF indirildi — e-postaya ekleyip gönderin.");
                })
              }
            >
              E-posta
            </button>
            <button
              type="button"
              disabled={busy}
              className="bk-btn bk-btn-ghost text-xs"
              onClick={() =>
                run(async () => {
                  await savePriceListPdf(listId, listName, true);
                  setMsg("✓ Müşteri PDF'i indirildi");
                })
              }
            >
              Müşteri PDF&apos;i indir
            </button>
          </div>

          {pl && (
            <pre className="max-h-40 overflow-auto rounded bg-slate-50 border p-2 text-[11px] whitespace-pre-wrap">{text}</pre>
          )}
        </div>
        <div className="flex justify-end bg-slate-50 px-4 py-3">
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
