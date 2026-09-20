"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";

type FormState = {
  code: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  tax_number: string;
  tax_office: string;
  notes: string;
  is_active: boolean;
  opening_balance: string;
};

const empty: FormState = {
  code: "",
  name: "",
  email: "",
  phone: "",
  city: "",
  address: "",
  tax_number: "",
  tax_office: "",
  notes: "",
  is_active: true,
  opening_balance: "0",
};

export default function NewSupplierPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        code: form.code.trim() || null,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        tax_number: form.tax_number.trim() || null,
        tax_office: form.tax_office.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        opening_balance: Number(form.opening_balance || 0),
      };
      const created = await apiFetch<{ id: number }>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/suppliers/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="max-w-3xl">
      <Link href="/suppliers" className="text-sm text-baykus-600 hover:underline">
        ← Tedarikçiler
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-6">Yeni Tedarikçi</h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}
      <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Kod</label>
            <input className={input} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="T-010" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ünvan *</label>
            <input className={input} required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">E-posta</label>
            <input type="email" className={input} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
            <input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Şehir</label>
            <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vergi No</label>
            <input className={input} value={form.tax_number} onChange={(e) => set("tax_number", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vergi Dairesi</label>
            <input className={input} value={form.tax_office} onChange={(e) => set("tax_office", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Açılış bakiyesi (borç ₺)</label>
            <input type="number" step="0.01" className={input} value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="active" type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            <label htmlFor="active" className="text-sm text-slate-700">Aktif tedarikçi</label>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Adres</label>
          <textarea rows={2} className={input} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notlar</label>
          <textarea rows={2} className={input} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-baykus-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <Link href="/suppliers" className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            İptal
          </Link>
        </div>
      </form>
    </div>
  );
}
