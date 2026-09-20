"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, downloadAuthFile } from "@/lib/api";

type Tab = "customers" | "stock" | "prices" | "bulk-price";

type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  missing?: number;
  errors?: string[];
  message?: string;
};

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: "customers", label: "Müşteri Şablonu", color: "#e2b44d" },
  { id: "stock", label: "Stok Şablonu", color: "#198754" },
  { id: "prices", label: "Fiyat Listesi Şablonu", color: "#be123c" },
  { id: "bulk-price", label: "Toplu Fiyat Güncelle", color: "#9f1239" },
];

function ImportWizardInner() {
  const sp = useSearchParams();
  const typeParam = sp.get("type");
  const initial: Tab =
    typeParam === "stock"
      ? "stock"
      : typeParam === "prices" || typeParam === "price-lists"
        ? "prices"
        : typeParam === "bulk-price" || typeParam === "toplu-fiyat"
          ? "bulk-price"
          : "customers";
  const [tab, setTab] = useState<Tab>(initial);
  const [priceListId, setPriceListId] = useState("");
  const [priceLists, setPriceLists] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const t = sp.get("type");
    if (t === "stock" || t === "customers") setTab(t);
    if (t === "prices" || t === "price-lists") setTab("prices");
    if (t === "bulk-price" || t === "toplu-fiyat") setTab("bulk-price");
  }, [sp]);

  useEffect(() => {
    if (tab !== "prices") return;
    void apiFetch<{ id: number; name: string }[]>("/api/price-lists")
      .then((rows) => {
        setPriceLists(rows);
        if (!priceListId && rows[0]) setPriceListId(String(rows[0].id));
      })
      .catch(() => setPriceLists([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onImport(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMsg("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      let path = "/api/customers/import";
      if (tab === "stock") path = "/api/products/stock/import";
      else if (tab === "bulk-price") path = "/api/products/bulk-price-import";
      else if (tab === "prices") {
        if (!priceListId) throw new Error("Hedef fiyat listesi seçin");
        path = `/api/price-lists/${priceListId}/import?mode=merge`;
      }
      const res = await apiFetch<ImportResult>(path, { method: "POST", body: fd });
      setResult(res);
      setMsg(
        res.message ||
          `İçe aktarma: ${res.created ?? 0} yeni, ${res.updated ?? res.updated ?? 0} güncellendi, ${res.skipped ?? res.missing ?? 0} atlandı`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "İçe aktarma hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/products" className="text-baykus-primary hover:underline">
            Ürün & Stok
          </Link>
          <span className="mx-1">/</span>
          <span className="font-medium">Excel İçe Aktarma</span>
        </div>
        <h1 className="text-xl font-bold">Excel Şablonları / İçe Aktarma</h1>
        <p className="text-sm text-baykus-muted">
          Masaüstü müşteri · stok · fiyat listesi şablonları — indir · doldur · aktar (sır yok)
        </p>
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setResult(null);
              setMsg("");
              setError("");
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: t.color, opacity: tab === t.id ? 1 : 0.55 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bk-card p-5 space-y-4 max-w-2xl">
        <ol className="text-sm space-y-2 list-decimal pl-5 text-slate-700">
          <li>Boş şablon CSV/XLSX indirin</li>
          <li>
            {tab === "customers" && "Satırları doldurun (zorunlu: Ad)"}
            {tab === "stock" && "Satırları doldurun (zorunlu: Ürün Adı veya SKU)"}
            {tab === "prices" && "Satırları doldurun (zorunlu: Ürün; Alış / Baskısız / Baskılı / Nakışlı)"}
            {tab === "bulk-price" && "Ürün Adı + Alış ve/veya Satış Fiyatı (isteğe bağlı BEDEN/RENK/Baskı)"}
          </li>
          <li>Dosyayı seçip içe aktarın — sunucu openpyxl/csv ile parse eder</li>
        </ol>

        {tab === "prices" && (
          <label className="block text-sm">
            <span className="text-xs text-baykus-muted">Hedef fiyat listesi</span>
            <select className="bk-input mt-0.5" value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
              <option value="">— Seçin —</option>
              {priceLists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-baykus-muted mt-1">
              Liste yoksa önce{" "}
              <Link href="/price-lists" className="text-baykus-primary hover:underline">
                Fiyat Listesi
              </Link>{" "}
              oluşturun.
            </p>
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          {tab === "customers" && (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/customers/import-template?fmt=csv", "musteri-sablon.csv")}
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/customers/import-template?fmt=xlsx", "musteri-sablon.xlsx")}
              >
                Şablon Excel
              </button>
              <Link href="/customers" className="bk-btn bk-btn-ghost text-sm">
                Müşteriler
              </Link>
            </>
          )}
          {tab === "stock" && (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/products/stock/import-template?fmt=csv", "stok-sablon.csv")}
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/products/stock/import-template?fmt=xlsx", "stok-sablon.xlsx")}
              >
                Şablon Excel
              </button>
              <Link href="/stock" className="bk-btn bk-btn-ghost text-sm">
                Stok sayfası
              </Link>
            </>
          )}
          {tab === "prices" && (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/price-lists/import-template?fmt=csv", "fiyat-listesi-sablon.csv")}
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/price-lists/import-template?fmt=xlsx", "fiyat-listesi-sablon.xlsx")}
              >
                Şablon Excel
              </button>
              <Link href="/price-lists" className="bk-btn bk-btn-ghost text-sm">
                Fiyat listeleri
              </Link>
            </>
          )}
          {tab === "bulk-price" && (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/products/bulk-price-template?fmt=csv", "toplu-fiyat-sablon.csv")}
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() => downloadAuthFile("/api/products/bulk-price-template?fmt=xlsx", "toplu-fiyat-sablon.xlsx")}
              >
                Şablon Excel
              </button>
              <Link href="/products" className="bk-btn bk-btn-ghost text-sm">
                Ürünler
              </Link>
            </>
          )}
        </div>

        <label className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 cursor-pointer hover:bg-slate-50 w-full justify-center text-sm">
          {busy ? "Aktarılıyor…" : "CSV / XLSX dosyası seç"}
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void onImport(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>

        {result && (
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <div>
              Eklenen: <strong>{result.created ?? 0}</strong> · Güncellenen:{" "}
              <strong>{result.updated ?? 0}</strong> · Atlanan / bulunamayan:{" "}
              <strong>{result.skipped ?? result.missing ?? 0}</strong>
            </div>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 text-xs text-amber-800 list-disc pl-4">
                {result.errors.slice(0, 8).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportWizardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted p-4">Yükleniyor…</p>}>
      <ImportWizardInner />
    </Suspense>
  );
}
