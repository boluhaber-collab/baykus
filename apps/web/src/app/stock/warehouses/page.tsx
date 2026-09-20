"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Warehouse = {
  id: number;
  name: string;
  code: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  is_default: boolean;
  product_count: number;
  stock_qty_total: number;
};

type StockRow = {
  product_id: number;
  variant_id: number | null;
  sku: string;
  name: string;
  stock_qty: number;
  warehouse: string;
};

const empty = { name: "", code: "", address: "", notes: "", is_active: true, is_default: false };

export default function WarehousesPage() {
  const [items, setItems] = useState<Warehouse[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [selected, setSelected] = useState<Warehouse | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [pick, setPick] = useState<StockRow | null>(null);
  const [transferQty, setTransferQty] = useState("1");
  const [toWarehouse, setToWarehouse] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<Warehouse[]>("/api/stock/warehouses"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const targets = useMemo(
    () => items.filter((w) => w.name !== selected?.name && w.is_active),
    [items, selected],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const body = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      address: form.address || null,
      notes: form.notes || null,
      is_active: form.is_active,
      is_default: form.is_default,
    };
    try {
      if (editId) {
        await apiFetch(`/api/stock/warehouses/${editId}`, { method: "PUT", body: JSON.stringify(body) });
        setMsg("Depo güncellendi");
      } else {
        await apiFetch("/api/stock/warehouses", { method: "POST", body: JSON.stringify(body) });
        setMsg("Depo eklendi");
      }
      setForm(empty);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Depoyu silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/stock/warehouses/${id}`, { method: "DELETE" });
      if (selected?.id === id) {
        setSelected(null);
        setStock([]);
        setShowTransfer(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function showStock(w: Warehouse) {
    setSelected(w);
    setShowTransfer(false);
    setPick(null);
    try {
      setStock(await apiFetch<StockRow[]>(`/api/stock/warehouses/${w.id}/stock`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok yüklenemedi");
    }
  }

  function openTransfer(row?: StockRow) {
    if (!selected) return;
    if (stock.length === 0) {
      setError("Bu depoda transfer edilecek ürün bulunmuyor.");
      return;
    }
    const first = row || stock[0];
    setPick(first);
    setTransferQty("1");
    setToWarehouse(targets[0]?.name || "");
    setTransferNote("");
    setShowTransfer(true);
    setError("");
    setMsg("");
  }

  async function doTransfer(e: FormEvent) {
    e.preventDefault();
    if (!selected || !pick) return;
    setError("");
    setMsg("");
    const qty = Number(transferQty) || 0;
    if (qty <= 0) {
      setError("Transfer miktarı sıfırdan büyük olmalıdır.");
      return;
    }
    if (!toWarehouse) {
      setError("Ürün ve hedef depo seçin.");
      return;
    }
    try {
      const res = await apiFetch<{
        ok: boolean;
        source_qty_after: number;
        target_qty_after: number;
      }>("/api/stock/warehouses/transfer", {
        method: "POST",
        body: JSON.stringify({
          product_id: pick.product_id,
          variant_id: pick.variant_id,
          quantity: qty,
          from_warehouse: selected.name,
          to_warehouse: toWarehouse,
          note: transferNote || null,
        }),
      });
      setMsg(
        `Stok transferi tamamlandı. Kaynak kalan: ${res.source_qty_after} · Hedef: ${res.target_qty_after}`,
      );
      setShowTransfer(false);
      await load();
      await showStock(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Depolar</h2>
          <p className="text-xs text-baykus-muted">
            Depo Tanımı · stok görünümü · Depolar Arası Transfer
          </p>
        </div>
        {selected && (
          <button
            type="button"
            className="rounded-lg bg-[#ef4444] text-white px-4 py-2 text-sm font-bold shadow-sm"
            onClick={() => openTransfer()}
          >
            Depolar Arası Transfer
          </button>
        )}
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={submit} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
        <label>
          Depo Adı
          <input required className="bk-input mt-0.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Kod
          <input className="bk-input mt-0.5" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </label>
        <label>
          Adres
          <input className="bk-input mt-0.5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label className="md:col-span-2">
          Not
          <input className="bk-input mt-0.5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Varsayılan
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Aktif
          </label>
          <button type="submit" className="bk-btn bk-btn-primary text-xs ml-auto">
            {editId ? "Kaydet" : "Ekle"}
          </button>
        </div>
      </form>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Kod</th>
              <th className="text-right">Ürün</th>
              <th className="text-right">Stok</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className={selected?.id === w.id ? "bg-slate-50" : undefined}>
                <td>
                  {w.name}
                  {w.is_default && <span className="ml-1 text-[10px] text-baykus-muted">(varsayılan)</span>}
                </td>
                <td className="font-mono text-xs">{w.code || "—"}</td>
                <td className="text-right tabular-nums">{w.product_count}</td>
                <td className="text-right tabular-nums">{w.stock_qty_total}</td>
                <td className="text-right space-x-2 text-xs">
                  <button type="button" className="text-baykus-primary hover:underline" onClick={() => showStock(w)}>
                    Stok
                  </button>
                  <button
                    type="button"
                    className="text-baykus-primary hover:underline"
                    onClick={() => {
                      setEditId(w.id);
                      setForm({
                        name: w.name,
                        code: w.code || "",
                        address: w.address || "",
                        notes: w.notes || "",
                        is_active: w.is_active,
                        is_default: w.is_default,
                      });
                    }}
                  >
                    Düzenle
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => remove(w.id)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-baykus-muted py-8">
                  Depo yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{selected.name} — stok</h3>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Ürün / Varyant</th>
                  <th className="text-right">Adet</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={`${s.product_id}-${s.variant_id}`}>
                    <td className="font-mono text-xs">{s.sku}</td>
                    <td>{s.name}</td>
                    <td className="text-right tabular-nums">{s.stock_qty}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-xs text-[#ef4444] font-semibold hover:underline"
                        onClick={() => openTransfer(s)}
                      >
                        Transfer
                      </button>
                    </td>
                  </tr>
                ))}
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-baykus-muted py-6">
                      Bu depoda ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showTransfer && selected && pick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={doTransfer}
            className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden"
          >
            <div className="bg-[#ef4444] text-white px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-bold tracking-wide">
                DEPOLAR ARASI TRANSFER · {selected.name.toUpperCase()}
              </div>
              <button type="button" className="text-white text-xl leading-none" onClick={() => setShowTransfer(false)}>
                ×
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <label className="block">
                <span className="font-bold">Ürün / Varyant</span>
                <select
                  className="bk-input mt-1"
                  value={`${pick.product_id}:${pick.variant_id ?? ""}`}
                  onChange={(e) => {
                    const [pid, vid] = e.target.value.split(":");
                    const row = stock.find(
                      (s) =>
                        s.product_id === Number(pid) &&
                        String(s.variant_id ?? "") === vid,
                    );
                    if (row) setPick(row);
                  }}
                >
                  {stock.map((s) => (
                    <option key={`${s.product_id}-${s.variant_id}`} value={`${s.product_id}:${s.variant_id ?? ""}`}>
                      {s.name} ({s.stock_qty} adet)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-bold">Hedef Depo</span>
                <select
                  required
                  className="bk-input mt-1"
                  value={toWarehouse}
                  onChange={(e) => setToWarehouse(e.target.value)}
                >
                  <option value="">— seç —</option>
                  {targets.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-bold">Miktar</span>
                <input
                  required
                  type="number"
                  min={1}
                  max={pick.stock_qty}
                  className="bk-input mt-1 w-40"
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                />
                <span className="ml-2 text-xs text-baykus-muted">En fazla {pick.stock_qty}</span>
              </label>
              <label className="block">
                <span className="text-xs text-baykus-muted">Not (opsiyonel)</span>
                <input
                  className="bk-input mt-1"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
              </label>
              <div className="flex justify-end pt-2">
                <button type="submit" className="rounded-lg bg-[#ef4444] text-white px-5 py-2.5 text-sm font-bold">
                  Transferi Tamamla
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
