"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardSummary, Product, apiFetch, formatMoney, stockBadgeClass } from "@/lib/api";
import { HubActionsBar, HubSection, HubTabs } from "@/components/hub/HubChrome";
import StatusFooter from "@/components/StatusFooter";

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
  const [brands, setBrands] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "all">("active");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBulkImageStub, setShowBulkImageStub] = useState(false);

  const criticalOnly = tab === "kritik";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category", category);
      if (brand) params.set("brand", brand);
      if (productType) params.set("type", productType);
      if (criticalOnly) params.set("critical_only", "true");
      if (activeFilter === "active") params.set("active_only", "true");
      const qs = params.toString();
      const [data, cats, brs, dash] = await Promise.all([
        apiFetch<Product[]>(`/api/products${qs ? `?${qs}` : ""}`),
        apiFetch<string[]>("/api/products/categories"),
        apiFetch<string[]>("/api/products/brands").catch(() => [] as string[]),
        apiFetch<DashboardSummary>("/api/dashboard/summary").catch(() => null),
      ]);
      setItems(data);
      setCategories(cats);
      setBrands(brs);
      setSummary(dash);
      setSelected({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, [q, category, brand, productType, criticalOnly, activeFilter]);

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

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected],
  );

  async function onDelete(id: number) {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silme hatası");
    }
  }

  async function bulkSoftDisable() {
    if (selectedIds.length === 0) {
      setError("Toplu silme için ürün seçin (satır kutuları)");
      return;
    }
    if (
      !confirm(
        `${selectedIds.length} ürün pasife alınacak (soft-disable). Devam?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setError("");
    setMsg("");
    try {
      let ok = 0;
      for (const id of selectedIds) {
        await apiFetch(`/api/products/${id}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: false }),
        });
        ok += 1;
      }
      setMsg(`${ok} ürün pasife alındı`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu pasifleştirme hatası");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleAll(on: boolean) {
    const next: Record<number, boolean> = {};
    if (on) for (const p of items) next[p.id] = true;
    setSelected(next);
  }

  return (
    <HubSection title="Ürün & Stok Merkezi" onRefresh={load}>
      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
          <span className="bk-kpi-icon">▣</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Ürün</div>
            <div className="bk-kpi-value">{stats.products}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">⧉</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Varyant</div>
            <div className="bk-kpi-value">{stats.variants}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#16a34a" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Stok Adedi</div>
            <div className="bk-kpi-value">{stats.qty}</div>
          </div>
        </div>
        <Link href="/stock/critical" className="bk-kpi-card" style={{ backgroundColor: "#dc2626" }}>
          <span className="bk-kpi-icon">⚠</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Kritik</div>
            <div className="bk-kpi-value">{stats.critical}</div>
          </div>
        </Link>
        <Link href="/reports/stock" className="bk-kpi-card" style={{ backgroundColor: "#7c3aed" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Stok Değeri</div>
            <div className="bk-kpi-value truncate">{formatMoney(Number(stats.value))}</div>
          </div>
        </Link>
      </div>

      {/* BizimHesap-style colorful CTA strip */}
      <div className="bk-product-cta-bar">
        <Link href="/products/new" className="bk-product-cta" style={{ backgroundColor: "#22a447" }}>
          + Yeni Ürün/Hizmet
        </Link>
        <Link href="/tools/import" className="bk-product-cta" style={{ backgroundColor: "#e2b44d" }}>
          Excel&apos;den yükle
        </Link>
        <Link
          href="/tools/import?type=bulk-price"
          className="bk-product-cta"
          style={{ backgroundColor: "#22d3ee", color: "#0f172a" }}
        >
          Toplu güncelle
        </Link>
        <button
          type="button"
          onClick={() => setShowBulkImageStub(true)}
          className="bk-product-cta"
          style={{ backgroundColor: "#7c3aed" }}
        >
          Toplu resim
        </button>
        <button
          type="button"
          onClick={() => void bulkSoftDisable()}
          disabled={bulkBusy}
          className="bk-product-cta"
          style={{ backgroundColor: "#facc15", color: "#0f172a" }}
        >
          Toplu sil {selectedIds.length ? `(${selectedIds.length})` : ""}
        </button>
        <Link href="/stock/entry" className="bk-product-cta" style={{ backgroundColor: "#0369a1" }}>
          Stok Girişi
        </Link>
      </div>
      <div className="flex flex-wrap gap-3 text-xs mb-2 text-baykus-muted">
        <span>Mevcut üründen kopyala: listeden <strong>Aç → Düzenle</strong> (SKU değiştirerek kaydet).</span>
      </div>

      {showBulkImageStub && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <div className="font-semibold mb-1">Toplu resim yükleme</div>
          <p className="text-xs mb-2">
            Çoklu dosya yükleme API&apos;si henüz yok — ürün kartında Fotoğraf URL alanını kullanın
            veya Excel ile <code>photo_url</code> güncelleyin.
          </p>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={() => setShowBulkImageStub(false)}>
            Kapat
          </button>
        </div>
      )}

      {/* Secondary links — CTA bar already covers Yeni/Excel/Toplu/Stok Girişi */}
      <div className="flex flex-wrap gap-2 mb-2 text-xs">
        <Link href="/stock/critical" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#be123c" }}>
          Kritik Stok
        </Link>
        <Link href="/stock/warehouses" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#14b8a6" }}>
          Depolar
        </Link>
        <Link href="/stock/count" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#22a447" }}>
          Stok Sayımı
        </Link>
        <Link href="/products/labels" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#334155" }}>
          Barkod / Etiket
        </Link>
        <Link href="/stock" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#0369a1" }}>
          Stok Yönetimi
        </Link>
        <Link href="/reports/stock" className="rounded-md px-2.5 py-1.5 font-semibold text-white" style={{ background: "#2563eb" }}>
          Stok Raporu
        </Link>
      </div>

      <HubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      {(tab === "urunler" || tab === "kritik") && (
        <>
          <div className="bk-filter-bar">
            <div className="flex rounded border border-baykus-line overflow-hidden text-xs font-semibold">
              <button
                type="button"
                className={`px-3 py-1.5 ${activeFilter === "active" ? "bg-[#0ea5e9] text-white" : "bg-white text-slate-600"}`}
                onClick={() => setActiveFilter("active")}
              >
                Aktif Ürünler
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${activeFilter === "all" ? "bg-[#0ea5e9] text-white" : "bg-white text-slate-600"}`}
                onClick={() => setActiveFilter("all")}
              >
                Tüm Ürünler
              </button>
            </div>
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
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="bk-input max-w-[160px]"
            >
              <option value="">Tüm markalar</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
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
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Ara:
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ad / SKU / marka…"
                className="bk-input max-w-[200px]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setCategory("");
                setBrand("");
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
            <table className="bk-table bk-product-list-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                      aria-label="Tümünü seç"
                    />
                  </th>
                  <th>Ürün Hizmet Adı</th>
                  <th className="text-right">Satış Fiyatı</th>
                  <th className="text-right">Stok Miktarı</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const total = p.total_stock ?? p.stock_qty;
                  const thr = p.critical_stock_threshold ?? 10;
                  const critical = p.is_critical || (p.product_type !== "hizmet" && total < thr);
                  const isService = p.product_type === "hizmet";
                  return (
                    <tr key={p.id} className={critical ? "bg-red-50/40" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[p.id]}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [p.id]: e.target.checked }))
                          }
                          aria-label={`Seç ${p.name}`}
                        />
                      </td>
                      <td className="font-medium">
                        <Link
                          href={`/products/${p.id}`}
                          className="text-baykus-text hover:text-baykus-primary uppercase tracking-tight"
                        >
                          {p.name}
                        </Link>
                        <div className="bk-product-chips mt-1">
                          {p.category && <span className="bk-product-chip bk-product-chip--cat">{p.category}</span>}
                          {isService && <span className="bk-product-chip bk-product-chip--svc">HİZMET</span>}
                          {p.brand && <span className="bk-product-chip bk-product-chip--brand">{p.brand}</span>}
                          {!p.is_active && <span className="bk-product-chip bk-product-chip--off">PASİF</span>}
                          <span className="bk-product-chip bk-product-chip--sku font-mono">{p.sku}</span>
                        </div>
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(Number(p.base_price))}
                      </td>
                      <td className="text-right">
                        {isService ? (
                          <span className="text-slate-500 font-medium">Hizmet</span>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stockBadgeClass(total, thr, critical)}`}
                          >
                            {total} ad
                            {critical ? " kritik" : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap space-x-2">
                        <Link
                          href={`/products/${p.id}/edit`}
                          className="text-baykus-primary hover:underline text-xs"
                        >
                          Düzenle
                        </Link>
                        <Link href={`/products/${p.id}`} className="text-slate-600 hover:underline text-xs">
                          Aç
                        </Link>
                        <button
                          onClick={() => onDelete(p.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-baykus-muted py-8">
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
              { href: "/stock", label: "Stok Yönetimi", color: "#0369a1" },
              { href: "/stock/warehouses", label: "Depolar", color: "#14b8a6" },
              { href: "/stock/count", label: "Stok Sayımı", color: "#22a447" },
              { href: "/products/labels", label: "Barkod / Etiket", color: "#334155" },
            ]}
          />
        </div>
      )}
      <StatusFooter onRefresh={load} />
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
