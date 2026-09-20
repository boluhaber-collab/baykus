"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppSettings, apiFetch } from "@/lib/api";

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

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    try {
      await apiFetch("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify({ require_login: requireLogin, user_mode: userMode }),
      });
      setMsg("Yetki / kilit ayarları kaydedildi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-base font-bold">Yetki / Kilit Modu</h2>
        <p className="text-xs text-baykus-muted">Giriş zorunluluğu ve varsayılan kullanıcı modu (uygulama ayarı JSON)</p>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}
      <form onSubmit={save} className="bk-card p-4 space-y-3 text-sm">
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Giriş zorunlu</label>
          <select className="bk-input" value={requireLogin} onChange={(e) => setRequireLogin(e.target.value)}>
            <option>Evet</option>
            <option>Hayır</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Kullanıcı modu</label>
          <select className="bk-input" value={userMode} onChange={(e) => setUserMode(e.target.value)}>
            <option>Yönetici</option>
            <option>Personel</option>
            <option>Tam Yetki</option>
            <option>Sadece Satış</option>
            <option>Sadece Stok</option>
          </select>
        </div>
        <button type="submit" className="bk-btn bk-btn-primary">Kaydet</button>
      </form>
    </div>
  );
}
