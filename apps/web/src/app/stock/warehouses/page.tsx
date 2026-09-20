"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
  const [transfer, setTransfer] = useState({
    product_id: "",
    quantity: "1",
    from_warehouse: "",
    to_warehouse: "",
    note: "",
  });
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
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function showStock(w: Warehouse) {
    setSelected(w);
    setTransfer((t) => ({ ...t, from_warehouse: w.name }));
    try {
      setStock(await apiFetch<StockRow[]>(`/api/stock/warehouses/${w.id}/stock`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok yüklenemedi");
    }
  }

  async function doTransfer(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/stock/warehouses/transfer", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(transfer.product_id),
          quantity: Number(transfer.quantity) || 1,
          from_warehouse: transfer.from_warehouse,
          to_warehouse: transfer.to_warehouse,
          note: transfer.note || null,
        }),
      });
      setMsg("Transfer kaydedildi");
      await load();
      if (selected) await showStock(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer hatası");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Depolar</h2>
        <p className="text-xs text-baykus-muted">Depo CRUD · stok görünümü · transfer stub</p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={submit} className="rounded border bg-white p-3 grid md:grid-cols-3 gap-2 text-sm">
        <label>
          Ad
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
            {editId ? "Güncelle" : "Ekle"}
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
                  <th>Ad</th>
                  <th className="text-right">Adet</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={`${s.product_id}-${s.variant_id}`}>
                    <td className="font-mono text-xs">{s.sku}</td>
                    <td>{s.name}</td>
                    <td className="text-right tabular-nums">{s.stock_qty}</td>
                  </tr>
                ))}
                {stock.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-baykus-muted py-6">
                      Bu depoda ürün yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={doTransfer} className="rounded border bg-white p-3 grid md:grid-cols-5 gap-2 text-sm">
            <label>
              Ürün ID
              <input
                required
                className="bk-input mt-0.5"
                value={transfer.product_id}
                onChange={(e) => setTransfer({ ...transfer, product_id: e.target.value })}
              />
            </label>
            <label>
              Adet
              <input
                required
                type="number"
                min={1}
                className="bk-input mt-0.5"
                value={transfer.quantity}
                onChange={(e) => setTransfer({ ...transfer, quantity: e.target.value })}
              />
            </label>
            <label>
              Kaynak
              <input
                required
                className="bk-input mt-0.5"
                value={transfer.from_warehouse}
                onChange={(e) => setTransfer({ ...transfer, from_warehouse: e.target.value })}
              />
            </label>
            <label>
              Hedef
              <select
                required
                className="bk-input mt-0.5"
                value={transfer.to_warehouse}
                onChange={(e) => setTransfer({ ...transfer, to_warehouse: e.target.value })}
              >
                <option value="">— seç —</option>
                {items
                  .filter((w) => w.name !== transfer.from_warehouse)
                  .map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="bk-btn bk-btn-primary text-xs w-full">
                Transfer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
