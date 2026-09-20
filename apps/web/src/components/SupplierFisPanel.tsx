"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PayableItem, Supplier, apiFetch, downloadPdf, formatMoney } from "@/lib/api";

export type FisTip = "Alacak Fişi" | "Borç Fişi";

type Props = {
  /** Preselected supplier id */
  initialSupplierId?: number | null;
  /** Open payables list for picker */
  payables?: PayableItem[];
  /** Extra suppliers (full list) when payables empty */
  onSaved?: () => void;
  /** Compact embedded style */
  embedded?: boolean;
  open?: boolean;
  onClose?: () => void;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Masaüstü `tedarikci_borc_alacak_fisi_penceresi` —
 * Alacak Fişi = borç artır (debit); Borç Fişi = bakiye azalt (credit).
 * Kasa/banka hareketi oluşturmaz.
 */
export default function SupplierFisPanel({
  initialSupplierId,
  payables = [],
  onSaved,
  embedded,
  open = true,
  onClose,
}: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>(
    initialSupplierId ? String(initialSupplierId) : "",
  );
  const [fisTip, setFisTip] = useState<FisTip>("Alacak Fişi");
  const [tarih, setTarih] = useState(today);
  const [vade, setVade] = useState(today);
  const [tutar, setTutar] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [lastId, setLastId] = useState<number | null>(null);

  useEffect(() => {
    if (initialSupplierId) setSupplierId(String(initialSupplierId));
  }, [initialSupplierId]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const list = await apiFetch<Supplier[]>("/api/suppliers?active=true&limit=500");
        setSuppliers(list);
        if (!supplierId && payables[0]) setSupplierId(String(payables[0].supplier_id));
        else if (!supplierId && list[0]) setSupplierId(String(list[0].id));
      } catch {
        /* ignore — picker may still use payables */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const picker = useMemo(() => {
    if (suppliers.length) {
      return suppliers.map((s) => ({
        id: s.id,
        label: `${s.code ? s.code + " · " : ""}${s.name}${s.balance != null ? ` (${formatMoney(Number(s.balance))})` : ""}`,
      }));
    }
    return payables.map((p) => ({
      id: p.supplier_id,
      label: `${p.code ? p.code + " · " : ""}${p.name} (${formatMoney(Number(p.balance))})`,
    }));
  }, [suppliers, payables]);

  const selectedName = useMemo(() => {
    const sid = Number(supplierId);
    const s = suppliers.find((x) => x.id === sid);
    if (s) return s.name;
    const p = payables.find((x) => x.supplier_id === sid);
    return p?.name || "";
  }, [supplierId, suppliers, payables]);

  if (!open) return null;

  async function kaydet(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setOk("");
    const sid = Number(supplierId);
    const amount = Number(String(tutar).replace(",", "."));
    if (!sid) {
      setError("Tedarikçi seçilmelidir.");
      return;
    }
    if (!(amount > 0)) {
      setError("Fiş tutarı sıfırdan büyük olmalıdır.");
      return;
    }
    setBusy(true);
    try {
      const side = fisTip === "Alacak Fişi" ? "debit" : "credit";
      const noteParts = [
        fisTip,
        vade ? `Vade: ${vade}` : "",
        aciklama.trim(),
      ].filter(Boolean);
      const mov = await apiFetch<{ id: number }>(`/api/suppliers/${sid}/movements`, {
        method: "POST",
        body: JSON.stringify({
          movement_type: "adjustment",
          amount,
          side,
          movement_date: tarih || null,
          note: noteParts.join(" · "),
          post_to_finance: false,
        }),
      });
      setLastId(mov.id);
      setOk(`${fisTip} kaydedildi · ${formatMoney(amount)}`);
      setTutar("");
      setAciklama("");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function printPdf() {
    const sid = Number(supplierId);
    const amount = Number(String(tutar).replace(",", "."));
    if (!sid || !(amount > 0)) {
      // print last saved via query if we have lastId — else draft from form
      if (!sid) {
        setError("Yazdırma için tedarikçi seçin.");
        return;
      }
    }
    try {
      const p = new URLSearchParams({
        tip: fisTip,
        amount: String(amount > 0 ? amount : 0),
        date: tarih,
        due: vade,
        note: aciklama.trim(),
      });
      if (lastId) p.set("movement_id", String(lastId));
      await downloadPdf(
        `/api/suppliers/${sid}/voucher-pdf?${p}`,
        `tedarikci-fis-${sid}.pdf`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF hatası");
    }
  }

  function printHtml() {
    const sid = Number(supplierId);
    if (!sid) {
      setError("Yazdırma için tedarikçi seçin.");
      return;
    }
    const amount = Number(String(tutar).replace(",", ".")) || 0;
    const p = new URLSearchParams({
      tip: fisTip,
      amount: String(amount),
      date: tarih,
      due: vade,
      note: aciklama.trim(),
    });
    if (lastId) p.set("movement_id", String(lastId));
    const token = typeof window !== "undefined" ? localStorage.getItem("baykus_token") : null;
    // Open API HTML print (auth via query token fallback not available) — use window print of local sheet
    const w = window.open("", "_blank", "width=720,height=640");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>${fisTip}</title>
<style>
body{font-family:Segoe UI,system-ui,sans-serif;margin:28px;color:#0f172a}
h1{font-size:1.35rem;margin:0 0 4px;color:#0f766e}
.box{border:1px solid #cbd5e1;border-radius:8px;padding:16px;margin-top:16px}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9}
.label{color:#64748b;font-size:12px}.val{font-weight:600}
.badge{display:inline-block;background:#62c9aa;color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:700}
@media print{button{display:none}}
</style></head><body>
<button onclick="window.print()">Yazdır</button>
<div class="badge">Borç-Alacak Fişi</div>
<h1>${fisTip}</h1>
<p style="color:#64748b;font-size:13px">Kasa/banka hareketi oluşturmaz · cari bakiyeyi düzenler</p>
<div class="box">
<div class="row"><span class="label">Tedarikçi</span><span class="val">${selectedName || "#" + sid}</span></div>
<div class="row"><span class="label">İşlem Tipi</span><span class="val">${fisTip}</span></div>
<div class="row"><span class="label">İşlem Tarihi</span><span class="val">${tarih}</span></div>
<div class="row"><span class="label">Vade</span><span class="val">${vade || "—"}</span></div>
<div class="row"><span class="label">Tutar</span><span class="val">${formatMoney(amount)}</span></div>
<div class="row"><span class="label">Açıklama</span><span class="val">${aciklama.trim() || "—"}</span></div>
</div>
<p style="margin-top:24px;font-size:11px;color:#94a3b8">Baykuş Baskı · Tedarikçi cari fişi</p>
<script>setTimeout(function(){window.print()},300)</script>
</body></html>`);
    w.document.close();
    void token;
  }

  const body = (
    <form onSubmit={kaydet} className="space-y-3">
      <div className="rounded-md px-3 py-2 text-xs text-amber-900" style={{ background: "#fffde7", border: "1px solid #fde68a" }}>
        Herhangi bir ödeme veya alış işlemi oluşturmadan tedarikçinin cari bakiyesini düzenler.
        <br />
        <b>Alacak Fişi</b> tedarikçiye olan borcu artırır; <b>Borç Fişi</b> bakiyeyi azaltır. Kasa/banka hareketi oluşmaz.
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {ok && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{ok}</div>}

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label>
          <span className="text-[11px] text-baykus-muted">Tedarikçi *</span>
          <select
            className="bk-input mt-0.5"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">Seçin…</option>
            {picker.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">İşlem Tipi</span>
          <select
            className="bk-input mt-0.5"
            value={fisTip}
            onChange={(e) => setFisTip(e.target.value as FisTip)}
          >
            <option value="Alacak Fişi">Alacak Fişi (borç artır)</option>
            <option value="Borç Fişi">Borç Fişi (bakiye azalt)</option>
          </select>
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">İşlem Tarihi</span>
          <input type="date" className="bk-input mt-0.5" value={tarih} onChange={(e) => setTarih(e.target.value)} />
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Vade Tarihi</span>
          <input type="date" className="bk-input mt-0.5" value={vade} onChange={(e) => setVade(e.target.value)} />
        </label>
        <label>
          <span className="text-[11px] text-baykus-muted">Tutar *</span>
          <input
            className="bk-input mt-0.5"
            inputMode="decimal"
            placeholder="0,00"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            required
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-[11px] text-baykus-muted">Açıklama</span>
          <textarea
            className="bk-input mt-0.5"
            rows={3}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Fiş açıklaması…"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        {onClose && (
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
        )}
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={printHtml} disabled={busy}>
          Yazdır
        </button>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void printPdf()} disabled={busy}>
          PDF
        </button>
        <button
          type="submit"
          className="bk-btn text-xs text-white"
          style={{ background: "#4caf50" }}
          disabled={busy}
        >
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return (
      <div className="rounded-xl border border-teal-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 text-white font-bold" style={{ background: "#62c9aa" }}>
          Borç-Alacak Fişleri
        </div>
        <div className="p-4">{body}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: "#62c9aa" }}>
          <h3 className="font-bold text-lg">Borç-Alacak Fişleri</h3>
          {onClose && (
            <button type="button" className="text-white/90 hover:text-white text-sm" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="p-4">{body}</div>
      </div>
    </div>
  );
}
