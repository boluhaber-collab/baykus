"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Product, apiFetch, formatMoney, stockBadgeClass } from "@/lib/api";

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category", category);
      if (productType) params.set("type", productType);
      if (criticalOnly) params.set("critical_only", "true");
      const qs = params.toString();
      const [data, cats] = await Promise.all([
        apiFetch<Product[]>(`/api/products${qs ? `?${qs}` : ""}`),
        apiFetch<string[]>("/api/products/categories"),
      ]);
      setItems(data);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, category, productType, criticalOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete(id: number) {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-baykus-text">Ürünler</h1>
          <p className="text-baykus-muted text-sm">Katalog · varyant · stok rozetleri</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/stock"
            className="rounded-lg border border-baykus-line px-4 py-2 text-sm hover:bg-baykus-bg"
          >
            Stok özeti
          </Link>
          <Link
            href="/stock/critical"
            className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm hover:bg-red-50"
          >
            Kritik stok
          </Link>
          <Link
            href="/products/new"
            className="rounded-lg bg-baykus-primary text-white px-4 py-2 text-sm font-medium"
          >
            + Yeni Ürün
          </Link>
        </div>
      </div>

      <div className="bk-filter-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ad / SKU / marka ara…"
          className="bk-input max-w-[220px]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bk-input max-w-[160px]"
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={productType}
          onChange={(e) => setProductType(e.target.value)}
          className="bk-input max-w-[140px]"
        >
          <option value="">Tüm türler</option>
          <option value="stoklu">Stoklu</option>
          <option value="hizmet">Hizmet</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-baykus-text px-1">
          <input
            type="checkbox"
            checked={criticalOnly}
            onChange={(e) => setCriticalOnly(e.target.checked)}
          />
          Sadece kritik
        </label>
        <div className="flex-1" />
        <button type="button" onClick={() => { setQ(""); setCategory(""); setProductType(""); setCriticalOnly(false); }} className="bk-btn bk-btn-ghost">
          Temizle
        </button>
        <button onClick={load} className="bk-btn bk-btn-primary">
          Ara
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Ad</th>
              <th>Kategori</th>
              <th>Tür</th>
              <th>Satış</th>
              <th>Stok</th>
              <th>Varyant</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const total = p.total_stock ?? p.stock_qty;
              const thr = p.critical_stock_threshold ?? 10;
              const critical = p.is_critical || (p.product_type !== "hizmet" && total < thr);
              return (
                <tr
                  key={p.id}
                  className={critical ? "bg-red-50/40" : undefined}
                >
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-medium">
                    <Link href={`/products/${p.id}`} className="text-baykus-primary hover:underline">
                      {p.name}
                    </Link>
                    {p.brand && <span className="block text-xs text-slate-400">{p.brand}</span>}
                  </td>
                  <td className="px-3 py-2">{p.category || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {p.product_type === "hizmet" ? "Hizmet" : "Stoklu"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatMoney(Number(p.base_price))}</td>
                  <td className="px-3 py-2">
                    {p.product_type === "hizmet" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stockBadgeClass(total, thr, critical)}`}
                      >
                        {total}
                        {critical ? " kritik" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-baykus-muted">{p.variants_count ?? 0}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                    <Link href={`/products/${p.id}`} className="text-baykus-primary hover:underline">
                      Aç
                    </Link>
                    <button onClick={() => onDelete(p.id)} className="text-red-600 hover:underline">
                      Sil
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-baykus-muted py-8">
                  Ürün yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
