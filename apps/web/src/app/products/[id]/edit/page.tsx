"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProductFormPayload } from "@/components/ProductForm";
import TabbedProductForm from "@/components/TabbedProductForm";
import { ProductDetail, apiFetch } from "@/lib/api";

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setProduct(await apiFetch<ProductDetail>(`/api/products/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  async function handleSubmit(payload: ProductFormPayload) {
    setBusy(true);
    setError("");
    try {
      await apiFetch<ProductDetail>(`/api/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      router.push(`/products/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
      setBusy(false);
    }
  }

  if (!product && !error) {
    return <p className="text-sm text-baykus-muted">Yükleniyor…</p>;
  }
  if (!product) {
    return (
      <div>
        <p className="text-red-600 mb-3">{error}</p>
        <Link href="/products" className="text-baykus-primary hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-3 pb-4">
      <div>
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/products" className="text-baykus-primary hover:underline">
            Ürün / Hizmet Tanımları
          </Link>
          <span className="mx-1">/</span>
          <Link href={`/products/${id}`} className="text-baykus-primary hover:underline">
            {product.sku}
          </Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-baykus-text">Düzenle</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900">{product.name}</h1>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <TabbedProductForm
        mode="edit"
        initial={product}
        busy={busy}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/products/${id}`)}
      />
    </div>
  );
}
