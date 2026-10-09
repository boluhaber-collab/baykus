"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PriceList, apiFetch, downloadAuthFile } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import PriceListShareDialog from "@/components/PriceListShareDialog";
import PriceListOutputOptions from "@/components/PriceListOutputOptions";
import { printPriceList, savePriceListPdf } from "@/lib/priceListActions";
import { PriceListShowCols, loadShowCols, saveShowCols } from "@/lib/priceListOutput";

export default function PriceListsPage() {
  const [items, setItems] = useState<PriceList[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [shareFor, setShareFor] = useState<PriceList | null>(null);
  const [showCols, setShowCols] = useState<PriceListShowCols>(() => loadShowCols());
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<PriceList[]>("/api/price-lists"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    saveShowCols(showCols);
  }, [showCols]);

  const filtered = useMemo(() => {
    let rows = items;
    if (onlyActive) rows = rows.filter((p) => p.is_active);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((p) => p.name.toLowerCase().includes(needle));
    }
    return rows;
  }, [items, q, onlyActive]);

  async function createList(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setError("");
    setCreating(true);
    try {
      const created = await apiFetch<PriceList>("/api/price-lists", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), items: [] }),
      });
      setName("");
      window.location.href = `/price-lists/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oluşturma hatası");
      setCreating(false);
    }
  }

  async function runAction(fn: () => Promise<void>, fallback: string) {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  const activeCount = items.filter((p) => p.is_active).length;
  const itemSum = items.reduce((s, p) => s + Number(p.item_count ?? p.items?.length ?? 0), 0);

  return (
    <div className="space-y-2 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-baykus-text leading-tight">Fiyat Listesi</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="bk-btn bk-btn-ghost text-xs"
            onClick={() => downloadAuthFile("/api/price-lists/import-template?fmt=xlsx", "fiyat-listesi-sablon.xlsx")}
          >
            Boş Şablon
          </button>
          <Link href="/tools/import?type=prices" className="bk-btn bk-btn-ghost text-xs">
            Excel İçe Aktar
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Liste</div>
            <div className="bk-kpi-value">{items.length}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">✓</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Aktif</div>
            <div className="bk-kpi-value">{activeCount}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">¤</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Toplam kalem</div>
            <div className="bk-kpi-value">{itemSum}</div>
          </div>
        </div>
      </div>

      <fieldset className="rounded border bg-white px-3 py-3">
        <legend className="px-1 text-xs font-semibold">Yeni fiyat listesi</legend>
        <form onSubmit={createList} className="flex flex-wrap gap-2 items-end text-sm">
          <label className="grow min-w-[220px] max-w-[360px]">
            <span className="text-[11px] text-baykus-muted">Liste adı *</span>
            <input
              required
              className="bk-input"
              placeholder="ör. Bayi 2026, Perakende, Kurumsal"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="bk-btn text-white text-xs disabled:opacity-60"
            style={{ background: "#198754" }}
          >
            {creating ? "Oluşturuluyor…" : "Oluştur"}
          </button>
        </form>
      </fieldset>

      <PriceListOutputOptions value={showCols} onChange={setShowCols} compact />

      <div className="bk-filter-bar">
        <input className="bk-input max-w-[220px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Sadece aktif
        </label>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Para birimi</th>
              <th className="text-right">Kalem</th>
              <th>Durum</th>
              <th>Geçerlilik</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pl) => (
              <tr key={pl.id}>
                <td className="font-medium">
                  <Link href={`/price-lists/${pl.id}`} className="text-baykus-primary hover:underline">
                    {pl.name}
                  </Link>
                </td>
                <td>{pl.currency}</td>
                <td className="text-right tabular-nums">{pl.item_count ?? pl.items?.length ?? 0}</td>
                <td>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      pl.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {pl.is_active ? "Aktif" : "Pasif"}
                  </span>
                </td>
                <td className="text-xs text-slate-500">
                  {[pl.valid_from, pl.valid_to].filter(Boolean).join(" → ") || "—"}
                </td>
                <td className="text-right text-xs whitespace-nowrap space-x-2">
                  <Link href={`/price-lists/${pl.id}`} className="text-baykus-primary hover:underline">
                    Kalemler
                  </Link>
                  <button
                    type="button"
                    className="text-teal-700 hover:underline"
                    onClick={() => void runAction(() => printPriceList(pl.id, showCols), "Yazdırma hatası")}
                  >
                    Yazdır
                  </button>
                  <button
                    type="button"
                    className="text-violet-700 hover:underline"
                    onClick={() => void runAction(() => savePriceListPdf(pl.id, pl.name, showCols), "PDF hatası")}
                  >
                    PDF olarak kaydet
                  </button>
                  <button type="button" className="text-rose-700 hover:underline" onClick={() => setShareFor(pl)}>
                    Paylaş
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-baykus-muted py-8">
                  {items.length === 0 ? "Henüz fiyat listesi yok — yukarıdan istediğiniz kadar liste oluşturabilirsiniz." : "Eşleşen liste yok"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {shareFor && (
        <PriceListShareDialog listId={shareFor.id} listName={shareFor.name} initialShowCols={showCols} onClose={() => setShareFor(null)} />
      )}
      <StatusFooter onRefresh={load} />
    </div>
  );
}
