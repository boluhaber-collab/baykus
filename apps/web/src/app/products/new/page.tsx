"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ProductForm, { ProductFormPayload } from "@/components/ProductForm";
import { ProductDetail, apiFetch } from "@/lib/api";

/** Masaüstü ürün kartı alanları — ProductForm (SKU, fiyat, stok, depo, beden/renk/baskı varyantları). */
export default function NewProductPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(payload: ProductFormPayload) {
    setBusy(true);
    setError("");
    try {
      const created = await apiFetch<ProductDetail>("/api/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/products/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/products" className="text-baykus-primary hover:underline">
            Ürün & Stok Merkezi
          </Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-baykus-text">Yeni Ürün / Hızlı Varyant</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Yeni Ürün</h1>
        <p className="text-slate-500 text-sm mt-1">
          Masaüstü ürün kartı: SKU · kategori · alış/satış · depo · kritik eşik · beden/renk/baskı
          varyantları. Toplu aktarım için{" "}
          <Link href="/tools/import" className="text-baykus-primary hover:underline">
            Excel içe aktarma
          </Link>
          .
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      {busy && (
        <div className="mb-3 text-sm text-baykus-muted">Kaydediliyor…</div>
      )}

      <div className="bk-card p-5">
        <ProductForm
          submitLabel="Ürünü Oluştur"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/products")}
        />
      </div>
    </div>
  );
}
