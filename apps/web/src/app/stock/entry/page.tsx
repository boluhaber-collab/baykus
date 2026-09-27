"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Product, ProductDetail, apiFetch, formatMoney } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

type Warehouse = {
  id: number;
  name: string;
  is_active: boolean;
  is_default?: boolean;
};

export default function StockEntryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [productId, setProductId] = useState("");
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [variantId, setVariantId] = useState("");
  const [warehouse, setWarehouse] = useState("Ana Depo");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ active_only: "true", type: "stoklu", limit: "200" });
      if (q.trim()) params.set("q", q.trim());
      const [prods, whs] = await Promise.all([
        apiFetch<Product[]>(`/api/products?${params}`),
        apiFetch<Warehouse[]>("/api/warehouses").catch(() => [] as Warehouse[]),
      ]);
      setProducts(prods.filter((p) => p.product_type !== "hizmet"));
      setWarehouses(whs.filter((w) => w.is_active !== false));
      const def = whs.find((w) => w.is_default) || whs[0];
      if (def && !warehouse) setWarehouse(def.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [q, warehouse]);

  useEffect(() => {
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = Number(productId);
    if (!Number.isFinite(id) || id <= 0) {
      setDetail(null);
      setVariantId("");
      return;
    }
    void apiFetch<ProductDetail>(`/api/products/${id}`)
      .then((d) => {
        setDetail(d);
        if (d.variants?.length) setVariantId(String(d.variants[0].id));
        else setVariantId("");
        if (d.warehouse) setWarehouse(d.warehouse);
        if (d.purchase_price != null) setUnitCost(String(d.purchase_price));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ürün yüklenemedi"));
  }, [productId]);

  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.sku.toLowerCase().includes(needle) ||
        (p.brand || "").toLowerCase().includes(needle),
    );
  }, [products, q]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = Number(productId);
    const quantity = Number(qty);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Ürün seçin");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Miktar > 0 olmalı");
      return;
    }
    if (detail?.variants?.length && !variantId) {
      setError("Varyant seçin");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        direction: "increase",
        quantity,
        variant_id: detail?.variants?.length ? Number(variantId) : null,
        reason: "Stok girişi",
        note: note.trim() || null,
        warehouse: warehouse.trim() || "Ana Depo",
      };
      if (unitCost !== "" && Number.isFinite(Number(unitCost))) {
        body.unit_cost = Number(unitCost);
      }
      if (date) {
        // local datetime → ISO; API stores as movement.created_at
        const dt = new Date(date);
        if (!Number.isNaN(dt.getTime())) body.movement_date = dt.toISOString();
      }
      const res = await apiFetch<{
        qty_before: number;
        qty_after: number;
        movement_id: number;
        total_stock: number;
      }>(`/api/products/${id}/stock/adjust`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMsg(
        `Stok girişi kaydedildi · hareket #${res.movement_id} · ${res.qty_before} → ${res.qty_after} (toplam ${res.total_stock})`,
      );
      setQty("1");
      setNote("");
      // refresh detail stock
      const d = await apiFetch<ProductDetail>(`/api/products/${id}`);
      setDetail(d);
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stok girişi başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-3 pb-2">
      <div className="bk-sticky-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-baykus-muted mb-0.5">
            <Link href="/products" className="text-baykus-primary hover:underline">
              Ürün & Stok
            </Link>
            <span className="mx-1">/</span>
            <Link href="/stock" className="text-baykus-primary hover:underline">
              Stok
            </Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">Stok Girişi</span>
          </div>
          <h1 className="text-lg font-bold text-baykus-text leading-tight">Stok Girişi</h1>
          <p className="text-baykus-muted text-[11px]">
            Ürün (+varyant) · depo · miktar · isteğe bağlı birim maliyet →{" "}
            <code className="text-[10px]">POST /api/products/&#123;id&#125;/stock/adjust</code> (increase)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock" className="bk-btn bk-btn-ghost text-xs">
            Stok hub
          </Link>
          <Link href="/products" className="bk-btn bk-btn-ghost text-xs">
            Ürün listesi
          </Link>
          <Link href="/stock/count" className="bk-btn bk-btn-ghost text-xs">
            Sayım
          </Link>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <form onSubmit={onSubmit} className="bk-card p-4 space-y-4" data-baykus-save>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Ürün ara / seç *</label>
            <div className="flex gap-2 mb-2">
              <input
                className="bk-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ad / SKU / marka…"
              />
              <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => void loadLists()}>
                Yenile
              </button>
            </div>
            <select
              className="bk-input"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">— ürün seçin —</option>
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name} (stok {p.total_stock ?? p.stock_qty})
                </option>
              ))}
            </select>
          </div>

          {detail?.variants && detail.variants.length > 0 && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Varyant *</label>
              <select
                className="bk-input"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                required
              >
                {detail.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku} · {v.name}
                    {v.size ? ` · ${v.size}` : ""}
                    {v.color ? ` · ${v.color}` : ""} (stok {v.stock_qty})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Depo *</label>
            {warehouses.length > 0 ? (
              <select
                className="bk-input"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="bk-input"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                placeholder="Ana Depo"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Miktar *</label>
            <input
              type="number"
              min={1}
              className="bk-input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Birim maliyet (opsiyonel)
            </label>
            <input
              type="number"
              step="0.01"
              className="bk-input"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="Alış/maliyet güncellenir"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tarih</label>
            <input
              type="datetime-local"
              className="bk-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Not</label>
            <textarea
              rows={2}
              className="bk-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="İrsaliye no, açıklama…"
            />
          </div>
        </div>

        {detail && (
          <div className="rounded border border-baykus-line bg-slate-50 px-3 py-2 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Satış: <strong>{formatMoney(Number(detail.base_price))}</strong>
            </span>
            <span>
              Alış: <strong>{formatMoney(Number(detail.purchase_price ?? 0))}</strong>
            </span>
            <span>
              Stok: <strong>{detail.total_stock ?? detail.stock_qty}</strong>
            </span>
            <Link href={`/products/${detail.id}`} className="text-baykus-primary hover:underline ml-auto">
              Ürün kartı →
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="bk-btn text-white font-bold text-sm px-4 py-2"
            style={{ backgroundColor: "#22a447" }}
          >
            {busy ? "Kaydediliyor…" : "✓ Stok Girişi Yap"}
          </button>
          <Link href="/stock" className="bk-btn text-white font-bold text-sm px-4 py-2" style={{ backgroundColor: "#0ea5e9" }}>
            ← Geri Dön
          </Link>
        </div>
      </form>

      <StatusFooter onRefresh={loadLists} />
    </div>
  );
}
