"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Warehouse = {
  id: number;
  name: string;
  is_active: boolean;
  stock_qty_total: number;
};

type CountLine = {
  product_id: number;
  variant_id: number | null;
  sku: string;
  name: string;
  system_qty: number;
  unit_cost: number;
  warehouse: string;
};

function StockCountPageInner() {
  const sp = useSearchParams();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [lines, setLines] = useState<CountLine[]>([]);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const keyOf = (r: CountLine) => `${r.product_id}:${r.variant_id ?? 0}`;

  const loadWarehouses = useCallback(async () => {
    try {
      const rows = await apiFetch<Warehouse[]>("/api/stock/warehouses");
      setWarehouses(rows.filter((w) => w.is_active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Depolar yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    const raw = sp.get("warehouse");
    if (raw && /^\d+$/.test(raw)) setWarehouseId(Number(raw));
  }, [sp]);


  const loadLines = useCallback(async (id: number) => {
    setError("");
    setMsg("");
    try {
      const rows = await apiFetch<CountLine[]>(`/api/stock/warehouses/${id}/count-lines`);
      setLines(rows);
      const init: Record<string, string> = {};
      for (const r of rows) init[keyOf(r)] = String(r.system_qty);
      setCounted(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sayım satırları yüklenemedi");
      setLines([]);
    }
  }, []);

  useEffect(() => {
    if (warehouseId === "") return;
    void loadLines(Number(warehouseId));
  }, [warehouseId, loadLines]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return lines;
    return lines.filter((r) => `${r.name} ${r.sku}`.toLocaleLowerCase("tr").includes(needle));
  }, [lines, q]);

  const diffs = useMemo(() => {
    let n = 0;
    for (const r of lines) {
      const v = Number(String(counted[keyOf(r)] ?? r.system_qty).replace(",", "."));
      if (Number.isFinite(v) && v !== r.system_qty) n += 1;
    }
    return n;
  }, [lines, counted]);

  async function save() {
    if (warehouseId === "") {
      setError("Önce depo seçin");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const items = [];
      for (const r of lines) {
        const raw = String(counted[keyOf(r)] ?? "").trim().replace(",", ".");
        const qty = Number(raw);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error(`Geçersiz miktar: ${r.name}`);
        }
        items.push({
          product_id: r.product_id,
          variant_id: r.variant_id,
          counted_qty: Math.round(qty),
        });
      }
      if (items.length === 0) {
        setError("Sayılacak ürün yok");
        return;
      }
      const res = await apiFetch<{ message: string; updated: number }>(
        `/api/stock/warehouses/${warehouseId}/count`,
        { method: "POST", body: JSON.stringify({ items }) },
      );
      setMsg(res.message);
      await loadLines(Number(warehouseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  const selected = warehouses.find((w) => w.id === warehouseId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/products" className="text-baykus-primary hover:underline">
              Ürün & Stok
            </Link>
            <span className="mx-1">/</span>
            <Link href="/stock/warehouses" className="text-baykus-primary hover:underline">
              Depolar
            </Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">Stok Sayımı</span>
          </div>
          <h1 className="text-xl font-bold text-baykus-text">
            {selected ? `${selected.name} Stok Sayımı` : "Stok Sayımı"}
          </h1>
          <p className="text-sm text-baykus-muted">
            Depo seçin · sistem miktarını kontrol edin · sayılanı girin · Kaydet
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || warehouseId === ""}
            className="bk-btn text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#22a447" }}
          >
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <Link href="/stock/warehouses" className="bk-btn bk-btn-ghost text-sm">
            Geri Dön
          </Link>
        </div>
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="bk-card mb-4 p-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-xs text-baykus-muted mb-1">Depo</span>
          <select
            className="bk-input min-w-[14rem]"
            value={warehouseId === "" ? "" : String(warehouseId)}
            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Depo seçin…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.stock_qty_total})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="block text-xs text-baykus-muted mb-1">Ara</span>
          <input
            className="bk-input w-full"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ürün / SKU…"
            disabled={!lines.length}
          />
        </label>
        <div className="text-xs text-baykus-muted pb-2">
          {lines.length} satır · {diffs} fark
        </div>
      </div>

      <div className="bk-card overflow-hidden">
        <div className="bg-[#334155] text-white text-sm font-bold px-4 py-3 tracking-wide">
          {(selected?.name || "DEPO").toLocaleUpperCase("tr")} SAYILAN ÜRÜNLER
        </div>
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="text-right">Sistemdeki Miktar</th>
                <th className="text-right">Sayılan Miktar</th>
                <th className="text-right">Birim Maliyeti (TL)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const k = keyOf(r);
                const val = counted[k] ?? String(r.system_qty);
                const num = Number(String(val).replace(",", "."));
                const diff = Number.isFinite(num) && num !== r.system_qty;
                return (
                  <tr key={k} className={diff ? "bg-amber-50/60" : undefined}>
                    <td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-baykus-muted font-mono">{r.sku}</div>
                    </td>
                    <td className="text-right tabular-nums text-baykus-muted">{r.system_qty}</td>
                    <td className="text-right">
                      <input
                        className="bk-input w-24 text-right ml-auto"
                        value={val}
                        onChange={(e) => setCounted((prev) => ({ ...prev, [k]: e.target.value }))}
                      />
                    </td>
                    <td className="text-right tabular-nums text-baykus-muted">
                      {Number(r.unit_cost || 0).toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
              {warehouseId !== "" && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-baykus-muted py-10">
                    Bu depoda sayılacak ürün bulunmuyor.
                  </td>
                </tr>
              )}
              {warehouseId === "" && (
                <tr>
                  <td colSpan={4} className="text-center text-baykus-muted py-10">
                    Sayım için depo seçin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export default function StockCountPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <StockCountPageInner />
    </Suspense>
  );
}
