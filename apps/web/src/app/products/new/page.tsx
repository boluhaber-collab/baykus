"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductFormPayload } from "@/components/ProductForm";
import TabbedProductForm from "@/components/TabbedProductForm";
import { ProductDetail, apiFetch } from "@/lib/api";

/** BizimHesap-parity sekmeli ürün ekleme formu. */
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
    <div className="max-w-5xl space-y-3 pb-4">
      <div>
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/products" className="text-baykus-primary hover:underline">
            Ürün / Hizmet Tanımları
          </Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-baykus-text">Yeni</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900">Yeni Ürün / Hizmet</h1>
        <p className="text-slate-500 text-xs mt-0.5">
          Tanım · Fiyatlandırma · Diğer · Resimler · Varyant · Bağlı ürünler. Toplu aktarım:{" "}
          <Link href="/tools/import" className="text-baykus-primary hover:underline">
            Excel
          </Link>
          .
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <TabbedProductForm
        mode="create"
        busy={busy}
        onSubmit={handleSubmit}
        onCancel={() => router.push("/products")}
      />
    </div>
  );
}
