"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import OrderForm, { OrderFormPayload } from "@/components/OrderForm";
import { OrderDetail, apiFetch } from "@/lib/api";

/**
 * İnce /orders/new — masaüstü Satış/Teklif = /sales/create.
 * Burada hem yönlendirme kartları hem tam OrderForm (müşteri/stok/fiyat listesi) sunulur.
 */
export default function NewOrderPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(payload: OrderFormPayload) {
    setError("");
    try {
      const created = await apiFetch<OrderDetail>("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/orders/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-baykus-muted mb-1">
          <Link href="/orders" className="text-baykus-primary hover:underline">
            Siparişler
          </Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-baykus-text">Yeni</span>
        </div>
        <h1 className="text-xl font-bold text-baykus-text mt-1">Yeni Sipariş / Satış</h1>
        <p className="text-baykus-muted text-sm">
          Masaüstü «Satış / Teklif Oluştur» tam arayüzü önerilir (varyant, depo, kapora, stok↓).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Link
          href="/sales/create?type=kayitli"
          className="rounded-xl px-5 py-5 text-white shadow-md hover:brightness-110"
          style={{ backgroundColor: "#1f6feb" }}
        >
          <div className="font-bold text-lg">Satış / Teklif Oluştur</div>
          <p className="text-sm opacity-90 mt-1">
            Kayıtlı müşteri · ürün satırları · beden/renk/depo · kapora · stok düşümü
          </p>
          <div className="mt-3 text-xs font-semibold">/sales/create →</div>
        </Link>
        <Link
          href="/sales/create?type=yeni"
          className="rounded-xl px-5 py-5 text-white shadow-md hover:brightness-110"
          style={{ backgroundColor: "#0f766e" }}
        >
          <div className="font-bold text-lg">Yeni Müşteri ile Satış</div>
          <p className="text-sm opacity-90 mt-1">Müşteri kartı oluşturarak hızlı satış</p>
          <div className="mt-3 text-xs font-semibold">type=yeni →</div>
        </Link>
        <Link
          href="/sales/retail/new"
          className="rounded-xl px-5 py-5 text-white shadow-md hover:brightness-110"
          style={{ backgroundColor: "#198754" }}
        >
          <div className="font-bold text-lg">Perakende Satış Gir</div>
          <p className="text-sm opacity-90 mt-1">Anında stok↓ + kasa/banka</p>
        </Link>
        <Link
          href="/quotes/new"
          className="rounded-xl px-5 py-5 text-white shadow-md hover:brightness-110"
          style={{ backgroundColor: "#7c3aed" }}
        >
          <div className="font-bold text-lg">Teklif Oluştur</div>
          <p className="text-sm opacity-90 mt-1">Şartlar / şablon alanları</p>
        </Link>
      </div>

      <div className="mb-4">
        <button
          type="button"
          className="bk-btn bk-btn-ghost text-sm"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Basit sipariş formunu gizle" : "Basit sipariş formu (OrderForm)"}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {showForm && (
        <div className="bk-card p-5">
          <p className="text-sm text-baykus-muted mb-4">
            Müşteri bakiyesi, stok ve fiyat listesi bağlantılı klasik form.
          </p>
          <OrderForm
            submitLabel="Siparişi Oluştur"
            onSubmit={handleSubmit}
            onCancel={() => router.push("/orders")}
          />
        </div>
      )}
    </div>
  );
}
