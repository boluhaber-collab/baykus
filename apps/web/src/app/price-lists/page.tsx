"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PriceList, apiFetch } from "@/lib/api";

export default function PriceListsPage() {
  const [items, setItems] = useState<PriceList[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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

  const filtered = useMemo(() => {
    let rows = items;
    if (onlyActive) rows = rows.filter((p) => p.is_active);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((p) => [p.name, p.description].join(" ").toLowerCase().includes(needle));
    }
    return rows;
  }, [items, q, onlyActive]);

  async function createList(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      const created = await apiFetch<PriceList>("/api/price-lists", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          items: [],
        }),
      });
      setName("");
      setDescription("");
      window.location.href = `/price-lists/${created.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oluşturma hatası");
    }
  }

  const activeCount = items.filter((p) => p.is_active).length;
  const itemSum = items.reduce((s, p) => s + Number(p.item_count ?? p.items?.length ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Fiyat Listesi</h2>
          <p className="text-xs text-baykus-muted">Fiyat / Maliyet › Fiyat Listesi · baskılı/baskısız/nakışlı · yazdır/CSV/PDF detayda</p>
        </div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Yenile
        </button>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-3 gap-2">
        <div className="bk-card px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Liste</div>
          <div className="text-xl font-bold">{items.length}</div>
        </div>
        <div className="bk-card px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Aktif</div>
          <div className="text-xl font-bold text-emerald-700">{activeCount}</div>
        </div>
        <div className="bk-card px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Toplam kalem</div>
          <div className="text-xl font-bold">{itemSum}</div>
        </div>
      </div>

      <fieldset className="rounded border bg-white px-3 py-3">
        <legend className="px-1 text-xs font-semibold">Yeni fiyat listesi</legend>
        <form onSubmit={createList} className="flex flex-wrap gap-2 items-end text-sm">
          <label>
            <span className="text-[11px] text-baykus-muted">Liste adı *</span>
            <input required className="bk-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grow min-w-[200px]">
            <span className="text-[11px] text-baykus-muted">Açıklama</span>
            <input className="bk-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button type="submit" className="bk-btn text-white text-xs" style={{ background: "#198754" }}>
            Oluştur
          </button>
        </form>
      </fieldset>

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
              <th>Açıklama</th>
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
                <td className="text-xs text-baykus-muted max-w-[200px] truncate">{pl.description || "—"}</td>
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
                  <Link href={`/price-lists/${pl.id}?print=1`} className="text-teal-700 hover:underline">
                    Yazdır
                  </Link>
                  <a
                    href={`#`}
                    className="text-violet-700 hover:underline"
                    onClick={async (e) => {
                      e.preventDefault();
                      try {
                        const { downloadPdf } = await import("@/lib/api");
                        await downloadPdf(`/api/price-lists/${pl.id}/export?fmt=pdf`, `${pl.name}-fiyat.pdf`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "PDF hatası");
                      }
                    }}
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Liste yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
