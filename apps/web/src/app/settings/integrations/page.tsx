"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BizimHesapSettings, IntegrationActionResult, apiFetch } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

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
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      const body: { api_key: string; api_secret?: string } = { api_key: settings.api_key };
      if (secretInput) body.api_secret = secretInput;
      const s = await apiFetch<BizimHesapSettings>("/api/settings/integrations/bizimhesap", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSettings(s);
      setSecretInput("");
      setMsg("BizimHesap ayarları kaydedildi (yerel stub)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBusy(false);
    }
  }

  async function run(path: string) {
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const r = await apiFetch<IntegrationActionResult>(path, { method: "POST" });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/settings" className="text-xs text-baykus-primary hover:underline">
            ← Ayarlar
          </Link>
          <h1 className="text-lg font-bold mt-1 leading-tight">Entegrasyonlar</h1>
          <p className="text-[11px] text-baykus-muted">Sistem › Entegrasyonlar · harici muhasebe köprüleri</p>
        </div>
      </div>

      {/* STUB banner — bilinçli dışı: canlı BizimHesap */}
      <div
        className="rounded border px-3 py-2.5 text-sm"
        style={{ backgroundColor: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" }}
      >
        <div className="font-bold text-[13px]">BizimHesap — STUB / İSKELET</div>
        <p className="text-xs mt-1 leading-relaxed">
          Canlı API çağrıları bilerek kapalıdır (parity dışı). Anahtar boşsa ağ isteği yapılmaz.
          Test / senkron düğmeleri yerel stub yanıtı döner; gerçek müşteri/ürün aktarımı yoktur.
          Out of scope: BizimHesap live, Selenium WA, DPAPI.
        </p>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="bk-kpi-strip">
        <div className="bk-kpi-card" style={{ backgroundColor: settings.configured ? "#198754" : "#64748b" }}>
          <span className="bk-kpi-icon">{settings.configured ? "✓" : "○"}</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">BizimHesap</div>
            <div className="bk-kpi-value text-base">{settings.configured ? "Yapılandırıldı" : "Boş"}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#0f766e" }}>
          <span className="bk-kpi-icon">⇄</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Mod</div>
            <div className="bk-kpi-value text-base">Stub</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
          <span className="bk-kpi-icon">🔑</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">API Key</div>
            <div className="bk-kpi-value text-sm truncate">{settings.api_key ? "••••" + settings.api_key.slice(-4) : "—"}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#7c3aed" }}>
          <span className="bk-kpi-icon">🌐</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Canlı Ağ</div>
            <div className="bk-kpi-value text-base">Kapalı</div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5">
          <legend className="px-1 text-xs font-bold">BizimHesap Kimlik Bilgileri</legend>
          <form onSubmit={save} className="space-y-2.5">
            <label className="block text-xs">
              <span className="font-medium text-baykus-muted">API Key</span>
              <input
                value={settings.api_key}
                onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                className="bk-input mt-1 font-mono"
                autoComplete="off"
                placeholder="(boş = ağ çağrısı yok)"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-baykus-muted">
                API Secret {settings.configured ? "(değiştirmek için yazın)" : ""}
              </span>
              <input
                type="password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="bk-input mt-1 font-mono"
                autoComplete="new-password"
                placeholder={settings.configured ? "••••••••" : ""}
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={busy} className="bk-btn bk-btn-primary text-xs font-bold">
                Kaydet
              </button>
              <button type="button" onClick={() => void load()} className="bk-btn bk-btn-ghost text-xs">
                Yenile
              </button>
            </div>
          </form>
        </fieldset>

        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5">
          <legend className="px-1 text-xs font-bold">Stub İşlemler</legend>
          <p className="text-[11px] text-baykus-muted mb-2">
            Bu düğmeler gerçek BizimHesap API&apos;sine bağlanmaz; sunucu stub yanıtı üretir.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("/api/settings/integrations/bizimhesap/test")}
              className="bk-btn text-xs font-bold text-white text-left justify-start"
              style={{ backgroundColor: "#0f766e" }}
            >
              🔌 Bağlantıyı test et (stub)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("/api/settings/integrations/bizimhesap/sync-customers")}
              className="bk-btn text-xs font-bold text-white text-left justify-start"
              style={{ backgroundColor: "#2563eb" }}
            >
              👥 Müşteri senkron (stub)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("/api/settings/integrations/bizimhesap/sync-products")}
              className="bk-btn text-xs font-bold text-white text-left justify-start"
              style={{ backgroundColor: "#7c3aed" }}
            >
              📦 Ürün senkron (stub)
            </button>
          </div>
        </fieldset>
      </div>

      {result && (
        <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5">
          <legend className="px-1 text-xs font-bold">Son Stub Yanıtı</legend>
          <div
            className={`rounded px-3 py-2 text-sm ${
              result.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-bold text-xs uppercase tracking-wide">{result.status}</div>
            <p className="mt-1 text-sm">{result.message}</p>
          </div>
        </fieldset>
      )}

      <fieldset className="rounded border border-baykus-line bg-white px-3 py-2.5">
        <legend className="px-1 text-xs font-bold">Diğer Entegrasyonlar</legend>
        <div className="bk-table-wrap border-0">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Durum</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">BizimHesap</td>
                <td>
                  <span className="rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
                    STUB
                  </span>
                </td>
                <td className="text-xs text-baykus-muted">Canlı dışı — anahtar saklanır, ağ yok</td>
              </tr>
              <tr>
                <td className="font-medium">WhatsApp Desktop</td>
                <td>
                  <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-bold">
                    DIŞI
                  </span>
                </td>
                <td className="text-xs text-baykus-muted">Selenium WA bilerek yok · wa.me şablonları var</td>
              </tr>
              <tr>
                <td className="font-medium">DPAPI / Windows secret</td>
                <td>
                  <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-bold">
                    DIŞI
                  </span>
                </td>
                <td className="text-xs text-baykus-muted">Web ortamında uygulanmaz</td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>

      <StatusFooter onRefresh={load} />
    </div>
  );
}
