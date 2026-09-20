"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardSummary, Product, apiFetch, formatMoney, stockBadgeClass } from "@/lib/api";
import { HubActionsBar, HubSection, HubSummaryCard, HubTabs } from "@/components/hub/HubChrome";

type Tab = "urunler" | "kritik" | "rapor";

const TABS: { id: Tab; label: string }[] = [
  { id: "urunler", label: "Ürünler" },
  { id: "kritik", label: "Kritik Stok" },
  { id: "rapor", label: "Rapor / Araçlar" },
];

function ProductsHubPageInner() {
  const sp = useSearchParams();
  const initial = sp.get("tab");
  const [tab, setTab] = useState<Tab>(
    initial === "kritik" || initial === "critical"
      ? "kritik"
      : initial === "rapor" || initial === "variants"
        ? initial === "variants"
          ? "urunler"
          : "rapor"
        : "urunler",
  );

  const [items, setItems] = useState<Product[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const criticalOnly = tab === "kritik";

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
      const [data, cats, dash] = await Promise.all([
        apiFetch<Product[]>(`/api/products${qs ? `?${qs}` : ""}`),
        apiFetch<string[]>("/api/products/categories"),
        apiFetch<DashboardSummary>("/api/dashboard/summary").catch(() => null),
      ]);
      setItems(data);
      setCategories(cats);
      setSummary(dash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, category, productType, criticalOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let variants = 0;
    let qty = 0;
    let critical = 0;
    for (const p of items) {
      variants += p.variants_count ?? 0;
      const total = p.total_stock ?? p.stock_qty ?? 0;
      if (p.product_type !== "hizmet") qty += total;
      const thr = p.critical_stock_threshold ?? 10;
      if (p.is_critical || (p.product_type !== "hizmet" && total < thr)) critical += 1;
    }
    return {
      products: summary?.products_count ?? items.length,
      variants: summary?.variants_count ?? variants,
      qty: summary?.stock_qty_total ?? qty,
      critical: summary?.critical_stock_count ?? critical,
      value: summary?.stock_value ?? 0,
    };
  }, [items, summary]);

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
    <HubSection title="Ürün & Stok Merkezi" onRefresh={load}>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
        <HubSummaryCard label="Ürün" value={stats.products} color="#2563eb" />
        <HubSummaryCard label="Varyant" value={stats.variants} color="#0f766e" />
        <HubSummaryCard label="Stok Adedi" value={stats.qty} color="#16a34a" />
        <HubSummaryCard label="Kritik" value={stats.critical} color="#dc2626" href="/stock/critical" />
        <HubSummaryCard label="Stok Değeri" value={formatMoney(Number(stats.value))} color="#7c3aed" href="/reports/stock" />
      </div>

      <HubActionsBar
        columns={6}
        actions={[
          { href: "/products?tab=urunler", label: "Ürün Yönetimi", color: "#0ea5e9" },
          { href: "/products?tab=variants", label: "Kartlar / Varyantlar", color: "#0284c7" },
          { href: "/stock", label: "Stok Yönetimi", color: "#0369a1" },
          { href: "/stock/critical", label: "Kritik Stok", color: "#be123c" },
          { href: "/reports/stock", label: "Stok Raporu", color: "#2563eb" },
          { href: "/products/new", label: "Hızlı Varyant", color: "#f59e0b" },
          { href: "/stock/warehouses", label: "Depolar", color: "#14b8a6" },
          { href: "/stock/count", label: "Stok Sayımı", color: "#22a447" },
          { href: "/tools/import", label: "Excel İçe Aktar", color: "#e2b44d" },
        ]}
      />

      <HubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {(tab === "urunler" || tab === "kritik") && (
        <>
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
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setQ("");
                setCategory("");
                setProductType("");
              }}
              className="bk-btn bk-btn-ghost"
            >
              Temizle
            </button>
            <button onClick={load} className="bk-btn bk-btn-primary">
              Ara
            </button>
          </div>

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
                    <tr key={p.id} className={critical ? "bg-red-50/40" : undefined}>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td className="font-medium">
                        <Link href={`/products/${p.id}`} className="text-baykus-primary hover:underline">
                          {p.name}
                        </Link>
                        {p.brand && <span className="block text-xs text-slate-400">{p.brand}</span>}
                      </td>
                      <td>{p.category || "—"}</td>
                      <td>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {p.product_type === "hizmet" ? "Hizmet" : "Stoklu"}
                        </span>
                      </td>
                      <td>{formatMoney(Number(p.base_price))}</td>
                      <td>
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
                      <td className="text-baykus-muted">{p.variants_count ?? 0}</td>
                      <td className="text-right whitespace-nowrap space-x-2">
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
        </>
      )}

      {tab === "rapor" && (
        <div className="bk-card p-4 space-y-2">
          <p className="text-sm text-baykus-muted mb-2">
            Stok ve ürün işlemlerini tek merkezden yönetin.
          </p>
          <HubActionsBar
            title="Rapor / Araçlar"
            columns={1}
            actions={[
              { href: "/reports/stock", label: "Stok Durumu Raporu", color: "#2563eb" },
              { href: "/stock/critical", label: "Kritik Stok Listesini Göster", color: "#be123c" },
              { href: "/tools/import", label: "Toplu Ürün / Stok Aktarımı", color: "#0ea5e9" },
              { href: "/stock", label: "Stok Yönetimi", color: "#0369a1" },
              { href: "/stock/warehouses", label: "Depolar", color: "#14b8a6" },
              { href: "/stock/count", label: "Stok Sayımı", color: "#22a447" },
              { href: "/tools/import", label: "Toplu Ürün / Stok Aktarımı", color: "#0ea5e9" },
            ]}
          />
        </div>
      )}
    </HubSection>
  );
}


export default function ProductsHubPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <ProductsHubPageInner />
    </Suspense>
  );
}
