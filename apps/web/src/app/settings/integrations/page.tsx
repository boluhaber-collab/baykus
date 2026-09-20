"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BizimHesapSettings, IntegrationActionResult, apiFetch } from "@/lib/api";

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<BizimHesapSettings>({
    api_key: "",
    api_secret: "",
    configured: false,
  });
  const [secretInput, setSecretInput] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<IntegrationActionResult | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const s = await apiFetch<BizimHesapSettings>("/api/settings/integrations/bizimhesap");
      setSettings(s);
      setSecretInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin)");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const body: { api_key: string; api_secret?: string } = { api_key: settings.api_key };
      if (secretInput) body.api_secret = secretInput;
      const s = await apiFetch<BizimHesapSettings>("/api/settings/integrations/bizimhesap", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSettings(s);
      setSecretInput("");
      setMsg("BizimHesap ayarları kaydedildi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  async function run(path: string) {
    setError("");
    setResult(null);
    try {
      const r = await apiFetch<IntegrationActionResult>(path, { method: "POST" });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem hatası");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Entegrasyonlar</h1>
        <p className="text-sm text-slate-500">BizimHesap iskeleti — anahtar yoksa ağ çağrısı yapılmaz</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <form onSubmit={save} className="mb-6 rounded-xl border bg-white p-5 shadow-sm max-w-xl space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">BizimHesap</span>
          <span className={`rounded px-2 py-0.5 text-xs ${settings.configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
            {settings.configured ? "yapılandırıldı" : "yapılandırılmadı"}
          </span>
        </div>
        <label className="block text-sm">
          <span className="text-slate-500">API Key</span>
          <input
            value={settings.api_key}
            onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
            autoComplete="off"
            placeholder="(boş bırakılabilir)"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-500">API Secret {settings.configured ? "(değiştirmek için yazın)" : ""}</span>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm"
            autoComplete="new-password"
            placeholder={settings.configured ? "••••••••" : ""}
          />
        </label>
        <button type="submit" className="rounded-lg bg-baykus-700 text-white px-4 py-2 text-sm">Kaydet</button>
      </form>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => run("/api/settings/integrations/bizimhesap/test")} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
          Bağlantıyı test et
        </button>
        <button onClick={() => run("/api/settings/integrations/bizimhesap/sync-customers")} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
          Müşteri senkron (stub)
        </button>
        <button onClick={() => run("/api/settings/integrations/bizimhesap/sync-products")} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
          Ürün senkron (stub)
        </button>
      </div>

      {result && (
        <div className={`rounded-xl border p-4 text-sm ${result.ok ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="font-medium">{result.status}</div>
          <p className="mt-1">{result.message}</p>
        </div>
      )}
    </div>
  );
}
