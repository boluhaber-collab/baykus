"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppSettings, apiFetch } from "@/lib/api";
import { LOCK_MODE_ALLOWED, NAV_GROUPS } from "@/lib/nav";

const MODE_HELP: Record<string, string> = {
  Yönetici: "Tüm menüler, ayarlar, yedekleme ve veri aktarımı açık kalır.",
  Personel: "Günlük satış, sipariş, müşteri ve stok ekranları açık kalır; yönetim ekranları gizlenir.",
  "Tam Yetki": "Tüm menüler açık kalır.",
  "Sadece Satış": "Müşteri Merkezi, Satış / Sipariş ve E-Ticaret bölümleri öne çıkar.",
  "Sadece Stok": "Ürün & Stok Merkezi ve Tedarik Merkezi bölümleri öne çıkar.",
};

const MODES = Object.keys(MODE_HELP);

export default function LockModePage() {
  const [requireLogin, setRequireLogin] = useState("Evet");
  const [userMode, setUserMode] = useState("Yönetici");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<AppSettings>("/api/settings/app")
      .then((s) => {
        setRequireLogin((s as AppSettings & { require_login?: string }).require_login || "Evet");
        setUserMode((s as AppSettings & { user_mode?: string }).user_mode || "Yönetici");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"));
  }, []);

  const help = useMemo(() => MODE_HELP[userMode] || "", [userMode]);
  const visible = useMemo(() => {
    const allowed = new Set(LOCK_MODE_ALLOWED[userMode] || LOCK_MODE_ALLOWED["Yönetici"]);
    return NAV_GROUPS.filter((g) => allowed.has(g.label)).map((g) => g.label);
  }, [userMode]);
  const hidden = useMemo(() => {
    const vis = new Set(visible);
    return NAV_GROUPS.filter((g) => !vis.has(g.label)).map((g) => g.label);
  }, [visible]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const updated = await apiFetch<AppSettings>("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify({ require_login: requireLogin, user_mode: userMode }),
      });
      try {
        const cached = localStorage.getItem("baykus_app_settings");
        const prev = cached ? (JSON.parse(cached) as AppSettings) : {};
        const next = { ...prev, ...updated, require_login: requireLogin, user_mode: userMode };
        localStorage.setItem("baykus_app_settings", JSON.stringify(next));
        window.dispatchEvent(new Event("baykus-settings-changed"));
      } catch {
        /* ignore */
      }
      setMsg(`Menü / kilit modu güncellendi → ${userMode} (${visible.length} grup görünür)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-bold">Yetki / Kilit Modu</h2>
        <p className="text-xs text-baykus-muted">
          Programı başka biri kullanırken sol menüde yalnızca gerekli bölümler görünsün (masaüstü
          yetki_kilit_modu_penceresi). İstemci tarafı menü filtresi + ayar kaydı.
        </p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setUserMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${
              userMode === m ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={save} className="bk-card p-4 space-y-3 text-sm">
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Giriş zorunlu</label>
          <select className="bk-input" value={requireLogin} onChange={(e) => setRequireLogin(e.target.value)}>
            <option>Evet</option>
            <option>Hayır</option>
          </select>
          <p className="text-[11px] text-baykus-muted mt-1">Web oturumu için önerilen: Evet.</p>
        </div>
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Kullanıcı / menü modu</label>
          <select className="bk-input" value={userMode} onChange={(e) => setUserMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          {help && <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5">{help}</p>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="font-semibold text-emerald-900 mb-1">Görünür ({visible.length})</div>
            <ul className="space-y-0.5 text-emerald-800">
              {visible.map((l) => (
                <li key={l}>• {l}</li>
              ))}
            </ul>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="font-semibold text-slate-700 mb-1">Gizli ({hidden.length})</div>
            {hidden.length === 0 ? (
              <p className="text-slate-500">Hepsi açık</p>
            ) : (
              <ul className="space-y-0.5 text-slate-600">
                {hidden.map((l) => (
                  <li key={l}>• {l}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button type="submit" className="bk-btn bk-btn-primary">
          Kaydet
        </button>
      </form>
    </div>
  );
}
