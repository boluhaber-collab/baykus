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
        <Link href="/orders" className="text-sm text-baykus-600 hover:underline">
          ← Siparişler
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Yeni Sipariş</h1>
        <p className="text-slate-500 text-sm">Başlık + satırlar</p>
      </div>
      <OrderForm
        submitLabel="Siparişi Oluştur"
        onSubmit={handleSubmit}
        onCancel={() => router.push("/orders")}
      />
    </div>
  );
}
