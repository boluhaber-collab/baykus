"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CustomerDetail,
  CustomerStatement,
  apiFetch,
  downloadPdf,
  formatMoney,
  getApiBase,
  getToken,
} from "@/lib/api";

export default function MutabakatPage() {
  const params = useParams();
  const id = Number(params.id);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from_date", from);
      if (to) qs.set("to_date", to);
      const [c, s] = await Promise.all([
        apiFetch<CustomerDetail>(`/api/customers/${id}`),
        apiFetch<CustomerStatement>(`/api/customers/${id}/statement?${qs}`),
      ]);
      setCustomer(c);
      setStatement(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id, from, to]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  const yon = useMemo(() => {
    const bal = Number(statement?.closing_balance ?? customer?.balance ?? 0);
    if (bal > 0) return { label: "BORÇ", text: "müşteri borçludur", bal };
    if (bal < 0) return { label: "ALACAK", text: "müşteri alacaklıdır", bal: Math.abs(bal) };
    return { label: "SIFIR", text: "bakiye yoktur", bal: 0 };
  }, [statement, customer]);

  async function exportCsv() {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ customer_id: String(id), format: "csv" });
      if (from) qs.set("date_from", from);
      if (to) qs.set("date_to", to);
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/reports/cari-statements?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mutabakat_${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV hatası");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ customer_id: String(id), format: "pdf" });
      if (from) qs.set("date_from", from);
      if (to) qs.set("date_to", to);
      await downloadPdf(`/api/reports/cari-statements?${qs}`, `mutabakat_${id}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setBusy(false);
    }
  }

  function printLetter() {
    window.print();
  }

  const todayLabel = new Date().toLocaleDateString("tr-TR");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2 print:hidden">
        <div>
          <h2 className="text-base font-bold">Mutabakat Mektubu</h2>
          <p className="text-xs text-baykus-muted">
            Müşteri › Mutabakat · dönem filtre · PDF/CSV/yazdır
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${id}`} className="bk-btn bk-btn-ghost text-xs">
            ← Müşteri kartı
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void exportCsv()} disabled={busy}>
            CSV
          </button>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void exportPdf()} disabled={busy}>
            PDF
          </button>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={printLetter}>
            Yazdır
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end bk-card p-3 print:hidden">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Başlangıç</label>
          <input type="date" className="bk-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">Bitiş</label>
          <input type="date" className="bk-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={() => void load()}>
          Uygula
        </button>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm print:hidden">{error}</div>}

      <div className="bk-card p-6 md:p-8 print:shadow-none print:border-0 space-y-4" id="mutabakat-letter">
        <div className="text-center">
          <div className="text-lg font-bold tracking-wide text-slate-800">CARİ HESAP MUTABAKAT MEKTUBU</div>
          <div className="text-xs text-slate-500 mt-1">{todayLabel}</div>
        </div>

        <p className="text-sm leading-relaxed text-slate-700">
          Sayın <strong>{(customer?.name || "—").toLocaleUpperCase("tr")}</strong>
          {customer?.company ? ` (${customer.company})` : ""},
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          {from || to
            ? `${from || "…"} — ${to || "…"} dönemi itibarıyla `
            : "Bugün itibarıyla "}
          cari hesabınızın bakiyesi{" "}
          <strong>{formatMoney(yon.bal)}</strong> tutarında{" "}
          <strong className={yon.label === "BORÇ" ? "text-red-700" : yon.label === "ALACAK" ? "text-emerald-700" : ""}>
            {yon.label}
          </strong>{" "}
          ({yon.text}).
        </p>
        <p className="text-sm text-slate-600">
          Açılış / dönem başı: {formatMoney(Number(statement?.opening_balance ?? 0))} · Kapanış:{" "}
          {formatMoney(Number(statement?.closing_balance ?? 0))} · Hareket:{" "}
          {statement?.movements?.length ?? 0}
        </p>

        <div className="bk-table-wrap overflow-auto max-h-[420px]">
          <table className="bk-table text-xs">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem</th>
                <th className="text-right">Borç</th>
                <th className="text-right">Alacak</th>
                <th className="text-right">Bakiye</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {(statement?.movements || []).map((m) => (
                <tr key={m.id}>
                  <td>{m.movement_date}</td>
                  <td>{m.movement_type}</td>
                  <td className="text-right tabular-nums">{formatMoney(Number(m.debit || 0))}</td>
                  <td className="text-right tabular-nums">{formatMoney(Number(m.credit || 0))}</td>
                  <td className="text-right tabular-nums font-medium">
                    {m.running_balance != null ? formatMoney(Number(m.running_balance)) : "—"}
                  </td>
                  <td className="text-slate-500">{m.note || "—"}</td>
                </tr>
              ))}
              {(statement?.movements || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-6">
                    Seçili dönemde hareket yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pt-8 grid sm:grid-cols-2 gap-8 text-xs text-slate-600">
          <div>
            <div className="border-t border-slate-300 pt-2 mt-12">Firma yetkilisi</div>
          </div>
          <div>
            <div className="border-t border-slate-300 pt-2 mt-12">Müşteri / Kaşe imza</div>
          </div>
        </div>
      </div>
    </div>
  );
}
