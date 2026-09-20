"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { AppSettings, apiFetch, clearToken } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HubTabs } from "@/components/hub/HubChrome";

type UserOut = {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
};

const ROLE_OPTIONS = ["admin", "satış", "üretim", "muhasebe"];

type Tab =
  | "genel"
  | "kullanicilar"
  | "entegrasyonlar"
  | "yedek"
  | "sistem"
  | "yardim";

const TABS: { id: Tab; label: string }[] = [
  { id: "genel", label: "Genel Ayarlar" },
  { id: "kullanicilar", label: "Kullanıcılar" },
  { id: "entegrasyonlar", label: "Entegrasyonlar" },
  { id: "yedek", label: "Yedekleme" },
  { id: "sistem", label: "Sistem" },
  { id: "yardim", label: "YARDIM" },
];

const EMPTY: AppSettings = {
  company_name: "",
  phone: "",
  whatsapp: "",
  web_adresi: "",
  pdf_alt_baslik: "",
  logo_dosyasi: "",
  form_logo_dosyasi: "",
  theme_label: "Açık",
  require_login: "Evet",
  user_mode: "Yönetici",
  veri_motoru: "SQLite",
  postgres_host: "",
  postgres_port: "5432",
  postgres_db: "baykus",
  postgres_user: "",
  postgres_ssl: "Hayır",
};

function SettingsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const action = sp.get("action");
  const initialTab = (sp.get("tab") as Tab) || "genel";

  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "genel",
  );
  const [users, setUsers] = useState<UserOut[]>([]);
  const [roles, setRoles] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [settings, setSettings] = useState<AppSettings>(EMPTY);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [userForm, setUserForm] = useState({
    email: "",
    full_name: "",
    password: "",
    roles: ["satış"] as string[],
  });
  const [pwd, setPwd] = useState<{ userId: number | ""; password: string }>({
    userId: "",
    password: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [u, r, s] = await Promise.all([
        apiFetch<UserOut[]>("/api/settings/users"),
        apiFetch<{ roles: { id: number; name: string; description?: string }[] }>(
          "/api/settings/roles",
        ),
        apiFetch<AppSettings>("/api/settings/app"),
      ]);
      setUsers(u);
      setRoles(r.roles || []);
      setSettings({ ...EMPTY, ...s });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin gerekir)");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (action === "switch-user") {
      clearToken();
      router.push("/login");
    }
  }, [action, router]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const body = { ...settings };
      // Never send secrets through this form
      const s = await apiFetch<AppSettings>("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSettings({ ...EMPTY, ...s });
      setMsg("Tüm ayarlar kaydedildi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ayar kaydı başarısız");
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      await apiFetch("/api/settings/users", {
        method: "POST",
        body: JSON.stringify(userForm),
      });
      setUserForm({ email: "", full_name: "", password: "", roles: ["satış"] });
      setMsg("Kullanıcı oluşturuldu");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kullanıcı oluşturulamadı");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (!pwd.userId) return;
    setError("");
    setMsg("");
    try {
      await apiFetch(`/api/settings/users/${pwd.userId}/password`, {
        method: "POST",
        body: JSON.stringify({ new_password: pwd.password }),
      });
      setPwd({ userId: "", password: "" });
      setMsg("Şifre güncellendi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre güncellenemedi");
    }
  }

  async function toggleRole(user: UserOut, role: string) {
    const next = user.roles.includes(role)
      ? user.roles.filter((r) => r !== role)
      : [...user.roles, role];
    try {
      await apiFetch(`/api/settings/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ roles: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rol güncellenemedi");
    }
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white";

  function field(
    key: keyof AppSettings,
    label: string,
    opts?: { type?: string; hint?: string },
  ) {
    return (
      <div>
        <label className="text-xs text-slate-500">{label}</label>
        <input
          className={input}
          type={opts?.type || "text"}
          value={String(settings[key] ?? "")}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
        />
        {opts?.hint && <p className="text-[11px] text-slate-400 mt-0.5">{opts.hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-0.5">Ayarlar</h1>
          <p className="text-slate-500 text-sm">Sistem › Ayarlar — masaüstü sekme yapısı</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-teal-600 bg-teal-700 text-white px-4 py-2 text-sm"
          onClick={() => {
            clearToken();
            router.push("/login");
          }}
        >
          Kullanıcı Değiştir
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <HubTabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === "genel" && (
        <form onSubmit={saveSettings} className="space-y-4">
          <fieldset className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <legend className="px-1 text-sm font-bold">Firma / Logo / PDF / WhatsApp</legend>
            <div className="grid md:grid-cols-2 gap-3">
              {field("company_name", "Firma Adı")}
              {field("whatsapp", "WhatsApp")}
              {field("phone", "Telefon")}
              {field("web_adresi", "Web Sitesi")}
              {field("logo_dosyasi", "Ana Ekran Logo Dosyası", {
                hint: "Sunucu yolu veya URL (dosya yükleme ayrı)",
              })}
              {field("form_logo_dosyasi", "PDF / Form Logo Dosyası")}
              {field("pdf_alt_baslik", "PDF Alt Başlık")}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <legend className="px-1 text-sm font-bold">Tema</legend>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500">Tema Seç</label>
                <select
                  className={input}
                  value={settings.theme_label || "Açık"}
                  onChange={(e) => setSettings({ ...settings, theme_label: e.target.value })}
                >
                  <option>Açık</option>
                  <option>Koyu</option>
                  <option>Varsayılan</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Giriş zorunlu</label>
                <select
                  className={input}
                  value={settings.require_login || "Evet"}
                  onChange={(e) => setSettings({ ...settings, require_login: e.target.value })}
                >
                  <option>Evet</option>
                  <option>Hayır</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Kullanıcı modu</label>
                <select
                  className={input}
                  value={settings.user_mode || "Yönetici"}
                  onChange={(e) => setSettings({ ...settings, user_mode: e.target.value })}
                >
                  <option>Yönetici</option>
                  <option>Standart</option>
                  <option>Kilitli</option>
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <legend className="px-1 text-sm font-bold">Veri Altyapısı</legend>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Veri Motoru</label>
                <select
                  className={input}
                  value={settings.veri_motoru || "SQLite"}
                  onChange={(e) => setSettings({ ...settings, veri_motoru: e.target.value })}
                >
                  <option>SQLite</option>
                  <option>Excel Yedek</option>
                </select>
              </div>
              {field("postgres_host", "VPS Sunucu")}
              {field("postgres_port", "Port")}
              {field("postgres_db", "Veritabanı")}
              {field("postgres_user", "Kullanıcı")}
              <div>
                <label className="text-xs text-slate-500">SSL</label>
                <select
                  className={input}
                  value={settings.postgres_ssl || "Hayır"}
                  onChange={(e) => setSettings({ ...settings, postgres_ssl: e.target.value })}
                >
                  <option>Hayır</option>
                  <option>Evet</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Şifre burada saklanmaz. Merkezi DB bağlantısı için bkz.{" "}
              <Link href="/settings/database" className="text-baykus-primary hover:underline">
                Merkezi DB / VPS
              </Link>
              .
            </p>
          </fieldset>

          <button type="submit" className="rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold">
            Tüm Ayarları Kaydet
          </button>
        </form>
      )}

      {tab === "kullanicilar" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold text-sm">Kullanıcılar</div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Ad</th>
                  <th className="px-4 py-3">E-posta</th>
                  <th className="px-4 py-3">Roller</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ROLE_OPTIONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => void toggleRole(u, r)}
                            className={`rounded-full px-2 py-0.5 text-xs border ${
                              u.roles.includes(r)
                                ? "bg-baykus-600 text-white border-baykus-600"
                                : "bg-white text-slate-600"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">{u.is_active ? "Aktif" : "Pasif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <form onSubmit={createUser} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
              <h2 className="font-semibold">Yeni kullanıcı</h2>
              <input
                className={input}
                placeholder="Ad Soyad"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                required
              />
              <input
                className={input}
                type="email"
                placeholder="E-posta"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
              <input
                className={input}
                type="password"
                placeholder="Şifre"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required
                minLength={6}
              />
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <label key={r} className="text-sm flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={userForm.roles.includes(r)}
                      onChange={(e) => {
                        setUserForm({
                          ...userForm,
                          roles: e.target.checked
                            ? [...userForm.roles, r]
                            : userForm.roles.filter((x) => x !== r),
                        });
                      }}
                    />
                    {r}
                  </label>
                ))}
              </div>
              <button type="submit" className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
                Kullanıcı Oluştur
              </button>
            </form>

            <form onSubmit={changePassword} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
              <h2 className="font-semibold">Şifre değiştir (admin)</h2>
              <select
                className={input}
                value={pwd.userId}
                onChange={(e) =>
                  setPwd({ ...pwd, userId: e.target.value ? Number(e.target.value) : "" })
                }
                required
              >
                <option value="">Kullanıcı seçin</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
              <input
                className={input}
                type="password"
                placeholder="Yeni şifre"
                value={pwd.password}
                onChange={(e) => setPwd({ ...pwd, password: e.target.value })}
                required
                minLength={6}
              />
              <button type="submit" className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
                Şifreyi Güncelle
              </button>
              <p className="text-xs text-slate-500">
                Mevcut roller: {roles.map((r) => r.name).join(", ") || "—"}
              </p>
            </form>
          </div>
        </div>
      )}

      {tab === "entegrasyonlar" && (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">BizimHesap / Entegrasyonlar</h2>
          <p className="text-sm text-slate-500">
            API anahtarları bu sekmede tutulmaz; ayrı güvenli sayfada yönetilir. Gerçek anahtarlar
            masaüstü ayarlar.json&apos;dan kopyalanmaz.
          </p>
          <Link
            href="/settings/integrations"
            className="inline-flex rounded-lg bg-[#1f6feb] text-white px-4 py-2 text-sm font-bold"
          >
            Entegrasyonlar Sayfasını Aç
          </Link>
        </div>
      )}

      {tab === "yedek" && (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Yedekleme</h2>
          <p className="text-sm text-slate-500">
            Sunucu tarafı zip yedek ve yedek test araçları.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/backups" className="rounded-lg bg-teal-700 text-white px-4 py-2 text-sm font-bold">
              Yedekleme
            </Link>
            <Link href="/settings/backups?tab=test" className="rounded-lg bg-amber-500 text-white px-4 py-2 text-sm font-bold">
              Yedek Test Et
            </Link>
          </div>
        </div>
      )}

      {tab === "sistem" && (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Sistem araçları</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings/lock-mode" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
              Yetki / Kilit Modu
            </Link>
            <Link href="/settings/audit" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
              İşlem Geçmişi
            </Link>
            <Link href="/settings/health" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
              Sistem Sağlık Merkezi
            </Link>
            <Link href="/settings/database" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">
              Merkezi DB / VPS
            </Link>
          </div>
        </div>
      )}

      {tab === "yardim" && (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold">Kullanım Kılavuzu</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Baykuş Baskı web arayüzü masaüstü programın menü ve ekran yapısını birebir takip eder.
            Sol menüdeki &quot;tek&quot; merkezler (Müşteri, Tedarik, Ürün &amp; Stok) büyük işlem
            düğmeleriyle açılır. Satış / Sipariş grubu alt yapraklara ayrılır. API anahtarları ve
            yerel Windows yolları webde saklanmaz.
          </p>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li>Ana Sayfa: KPI, hızlı işlemler, atölye, notlar</li>
            <li>Sipariş Merkezi: sekmeler, tasarım onayı, WhatsApp taslak</li>
            <li>Ayarlar: firma bilgileri ve kullanıcı yönetimi (bu sayfa)</li>
          </ul>
          <Link href="/dashboard" className="text-baykus-primary text-sm hover:underline">
            Ana Sayfaya dön →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted">Yükleniyor…</p>}>
      <SettingsPageInner />
    </Suspense>
  );
}
