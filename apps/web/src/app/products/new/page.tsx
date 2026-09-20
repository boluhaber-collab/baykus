"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductForm, { ProductFormPayload } from "@/components/ProductForm";
import { ProductDetail, apiFetch } from "@/lib/api";

export default function NewProductPage() {
  const router = useRouter();

  async function handleSubmit(payload: ProductFormPayload) {
    const created = await apiFetch<ProductDetail>("/api/products", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    router.push(`/products/${created.id}`);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/products" className="text-sm text-baykus-600 hover:underline">
          ← Ürünler
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Yeni Ürün</h1>
        <p className="text-slate-500 text-sm">Kart + varyantlar</p>
      </div>
      <ProductForm
        submitLabel="Ürünü Oluştur"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/products")}
      />
    </div>
  );
}
