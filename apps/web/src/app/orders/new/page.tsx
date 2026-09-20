"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import OrderForm, { OrderFormPayload } from "@/components/OrderForm";
import { OrderDetail, apiFetch } from "@/lib/api";

export default function NewOrderPage() {
  const router = useRouter();

  async function handleSubmit(payload: OrderFormPayload) {
    const created = await apiFetch<OrderDetail>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    router.push(`/orders/${created.id}`);
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/orders" className="text-baykus-primary hover:underline">Siparişler</Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-baykus-text">Yeni</span>
        </div>
        <h1 className="text-xl font-bold text-baykus-text mt-1">Yeni Sipariş</h1>
        <p className="text-baykus-muted text-sm">Müşteri bakiyesi, stok ve fiyat listesi bağlantılı</p>
      </div>
      <OrderForm
        submitLabel="Siparişi Oluştur"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/orders")}
      />
    </div>
  );
}
