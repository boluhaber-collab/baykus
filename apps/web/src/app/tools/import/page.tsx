"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, downloadAuthFile } from "@/lib/api";

type Tab = "customers" | "stock";

type ImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
};

export default function ImportWizardPage() {
  const [tab, setTab] = useState<Tab>("customers");
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
      const path = tab === "customers" ? "/api/customers/import" : "/api/products/stock/import";
      const res = await apiFetch<ImportResult>(path, { method: "POST", body: fd });
      setResult(res);
      setMsg(
        res.message ||
          `İçe aktarma: ${res.created ?? 0} yeni, ${res.updated ?? 0} güncellendi, ${res.skipped ?? 0} atlandı`,
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
        <h1 className="text-xl font-bold">Excel İçe Aktarma Sihirbazı</h1>
        <p className="text-sm text-baykus-muted">
          Masaüstü «Excelden Müşteri» / «Toplu Stok» — şablon indir · doğrula · aktar (sır yok)
        </p>
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <div className="flex gap-2 mb-4">
        {(
          [
            ["customers", "Excelden Müşteri", "#e2b44d"],
            ["stock", "Toplu Stok", "#198754"],
          ] as const
        ).map(([id, label, color]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setResult(null);
              setMsg("");
              setError("");
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{
              backgroundColor: color,
              opacity: tab === id ? 1 : 0.55,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bk-card p-5 space-y-4 max-w-2xl">
        <ol className="text-sm space-y-2 list-decimal pl-5 text-slate-700">
          <li>Şablon CSV/XLSX indirin</li>
          <li>Satırları doldurun (zorunlu: müşteri Adı / stok Ürün Adı veya SKU)</li>
          <li>Dosyayı seçip içe aktarın — sunucu openpyxl/csv ile parse eder</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          {tab === "customers" ? (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() =>
                  downloadAuthFile("/api/customers/import-template?fmt=csv", "musteri-sablon.csv")
                }
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() =>
                  downloadAuthFile("/api/customers/import-template?fmt=xlsx", "musteri-sablon.xlsx")
                }
              >
                Şablon Excel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() =>
                  downloadAuthFile("/api/products/stock/import-template?fmt=csv", "stok-sablon.csv")
                }
              >
                Şablon CSV
              </button>
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-sm"
                onClick={() =>
                  downloadAuthFile("/api/products/stock/import-template?fmt=xlsx", "stok-sablon.xlsx")
                }
              >
                Şablon Excel
              </button>
              <Link href="/stock" className="bk-btn bk-btn-ghost text-sm">
                Stok sayfası
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
              <strong>{result.updated ?? 0}</strong> · Atlanan: <strong>{result.skipped ?? 0}</strong>
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
