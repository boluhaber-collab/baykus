"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppSettings, apiFetch } from "@/lib/api";

const MODE_HELP: Record<string, string> = {
  Yönetici: "Tüm menüler, ayarlar, yedekleme ve veri aktarımı açık kalır.",
  Personel: "Günlük satış, sipariş, müşteri ve stok ekranları açık kalır; yönetim ekranları gizlenir.",
  "Tam Yetki": "Tüm menüler açık kalır.",
  "Sadece Satış": "Müşteri Merkezi, Satış / Sipariş ve E-Ticaret bölümleri öne çıkar.",
  "Sadece Stok": "Ürün & Stok Merkezi ve Tedarik Merkezi bölümleri öne çıkar.",
};

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

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify({ require_login: requireLogin, user_mode: userMode }),
      });
      setMsg("Menü / kilit modu güncellendi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt hatası");
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-base font-bold">Yetki / Kilit Modu</h2>
        <p className="text-xs text-baykus-muted">
          Programı başka biri kullanırken sol menüde yalnızca gerekli bölümler görünsün.
        </p>
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
          <p className="text-[11px] text-baykus-muted mt-1">Web oturumu için önerilen: Evet.</p>
        </div>
        <div>
          <label className="block text-xs text-baykus-muted mb-1">Kullanıcı / menü modu</label>
          <select className="bk-input" value={userMode} onChange={(e) => setUserMode(e.target.value)}>
            <option>Yönetici</option>
            <option>Personel</option>
            <option>Tam Yetki</option>
            <option>Sadece Satış</option>
            <option>Sadece Stok</option>
          </select>
          {help && <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1.5">{help}</p>}
        </div>
        <button type="submit" className="bk-btn bk-btn-primary">
          Kaydet
        </button>
      </form>
    </div>
  );
}
