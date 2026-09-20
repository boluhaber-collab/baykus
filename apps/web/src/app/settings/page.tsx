"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  AppSettings,
  VariantOption,
  apiFetch,
  clearToken,
} from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HubTabs } from "@/components/hub/HubChrome";
import { QUICK_ACTION_CATALOG, DEFAULT_SOL_MENU_ORDER } from "@/lib/nav";

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
  | "hizli"
  | "solmenu"
  | "varyant"
  | "sablon"
  | "kullanicilar"
  | "entegrasyonlar"
  | "yedek"
  | "sistem"
  | "yardim";

const TABS: { id: Tab; label: string }[] = [
  { id: "genel", label: "Genel Ayarlar" },
  { id: "hizli", label: "Hızlı İşlemler" },
  { id: "solmenu", label: "Sol Menü Sıralaması" },
  { id: "varyant", label: "Varyant Yönetimi" },
  { id: "sablon", label: "Şablon Yönetimi" },
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
  hizli_islemler: QUICK_ACTION_CATALOG.filter((a) =>
    ["satis_teklif_olustur", "siparis_listesi", "atolye_paneli", "musteri_merkezi", "gider_takibi", "urun_stok_merkezi", "alis_hareketleri"].includes(a.id),
  ).map((a) => a.id),
  sol_menu_sirasi: [...DEFAULT_SOL_MENU_ORDER],
  sol_menu_adlari: {},
  teklif_sablon_adi: "Teklif Formu",
  teklif_sablon_baslik: "Teklif Formu",
  teklif_sablon_alt_baslik: "Kişiye ve Kuruma Özel Baskı Hizmetleri",
  teklif_sablon_logo_goster: "Evet",
  teklif_sablon_musteri_goster: "Evet",
  teklif_sablon_urun_detay_goster: "Evet",
  teklif_sablon_toplam_goster: "Evet",
  teklif_sablon_not_goster: "Evet",
  teklif_sablon_sartlar_goster: "Evet",
  teklif_sablon_sartlar: "",
  teklif_sablon_kapanis: "",
};

const VARIANT_KINDS = ["Beden", "Renk", "Baskı", "Birim", "Ebat"];

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
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [varForm, setVarForm] = useState({ kind: "Beden", value: "", note: "" });
  const [varFilter, setVarFilter] = useState("");
  const [varSelected, setVarSelected] = useState<number[]>([]);
  const [menuSel, setMenuSel] = useState<number | null>(null);
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
      const [u, r, s, v] = await Promise.all([
        apiFetch<UserOut[]>("/api/settings/users"),
        apiFetch<{ roles: { id: number; name: string; description?: string }[] }>(
          "/api/settings/roles",
        ),
        apiFetch<AppSettings>("/api/settings/app"),
        apiFetch<VariantOption[]>("/api/settings/variants").catch(() => [] as VariantOption[]),
      ]);
      setUsers(u);
      setRoles(r.roles || []);
      setSettings({ ...EMPTY, ...s });
      setVariants(v);
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

  async function saveSettings(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setMsg("");
    try {
      const body = { ...settings };
      // Never send secrets
      const s = await apiFetch<AppSettings>("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSettings({ ...EMPTY, ...s });
      setMsg("Tüm ayarlar kaydedildi");
      try {
        localStorage.setItem("baykus_app_settings", JSON.stringify(s));
        window.dispatchEvent(new Event("baykus-settings-changed"));
      } catch {
        /* ignore */
      }
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

  const hizliSet = useMemo(
    () => new Set(settings.hizli_islemler || []),
    [settings.hizli_islemler],
  );

  function toggleHizli(key: string, fixed?: boolean) {
    if (fixed) return;
    const cur = new Set(settings.hizli_islemler || []);
    if (cur.has(key)) cur.delete(key);
    else cur.add(key);
    // keep fixed
    for (const a of QUICK_ACTION_CATALOG) {
      if (a.fixed) cur.add(a.id);
    }
    setSettings({ ...settings, hizli_islemler: Array.from(cur) });
  }

  const menuOrder = settings.sol_menu_sirasi?.length
    ? settings.sol_menu_sirasi
    : [...DEFAULT_SOL_MENU_ORDER];

  function moveMenu(dir: "up" | "down" | "top" | "bottom") {
    if (menuSel === null) {
      setError("Önce taşınacak menü bölümünü seçin.");
      return;
    }
    const arr = [...menuOrder];
    const i = menuSel;
    let j = i;
    if (dir === "up") j = Math.max(0, i - 1);
    if (dir === "down") j = Math.min(arr.length - 1, i + 1);
    if (dir === "top") j = 0;
    if (dir === "bottom") j = arr.length - 1;
    if (j === i) return;
    const [item] = arr.splice(i, 1);
    arr.splice(j, 0, item);
    setSettings({ ...settings, sol_menu_sirasi: arr });
    setMenuSel(j);
  }

  function renameMenu() {
    if (menuSel === null) {
      setError("Önce adı değiştirilecek menü bölümünü seçin.");
      return;
    }
    const sys = menuOrder[menuSel];
    const cur = settings.sol_menu_adlari?.[sys] || sys;
    const next = window.prompt("Sol Menü Başlığını Değiştir", cur);
    if (next === null) return;
    const t = next.trim();
    if (!t) {
      setError("Başlık boş bırakılamaz.");
      return;
    }
    if (t.length > 40) {
      setError("Başlık en fazla 40 karakter olabilir.");
      return;
    }
    const adlar = { ...(settings.sol_menu_adlari || {}) };
    // uniqueness among display names
    const used = new Set(
      menuOrder.map((m) => (m === sys ? t : adlar[m] || m).toLowerCase()),
    );
    if ([...used].filter((x) => x === t.toLowerCase()).length > 1) {
      setError("Bu başlık başka bir menü bölümünde kullanılıyor.");
      return;
    }
    adlar[sys] = t;
    setSettings({ ...settings, sol_menu_adlari: adlar });
  }

  function resetMenuLabel() {
    if (menuSel === null) {
      setError("Önce başlığı sıfırlanacak menü bölümünü seçin.");
      return;
    }
    const sys = menuOrder[menuSel];
    const adlar = { ...(settings.sol_menu_adlari || {}) };
    delete adlar[sys];
    setSettings({ ...settings, sol_menu_adlari: adlar });
  }

  async function saveVariant(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!varForm.kind.trim() || !varForm.value.trim()) {
      setError("Tür ve değer alanları gerekli.");
      return;
    }
    try {
      if (varSelected.length === 1) {
        await apiFetch(`/api/settings/variants/${varSelected[0]}`, {
          method: "PUT",
          body: JSON.stringify(varForm),
        });
      } else {
        await apiFetch("/api/settings/variants", {
          method: "POST",
          body: JSON.stringify(varForm),
        });
      }
      setVarForm({ kind: varForm.kind, value: "", note: "" });
      setVarSelected([]);
      setMsg("Varyant kaydedildi");
      setVariants(await apiFetch<VariantOption[]>("/api/settings/variants"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Varyant kaydı başarısız");
    }
  }

  async function deleteVariants() {
    if (!varSelected.length) {
      setError("Silinecek varyantları seçin.");
      return;
    }
    if (!confirm(`${varSelected.length} varyant silinsin mi?`)) return;
    try {
      await apiFetch("/api/settings/variants/bulk-delete", {
        method: "POST",
        body: JSON.stringify(varSelected),
      });
      setVarSelected([]);
      setMsg("Varyantlar silindi");
      setVariants(await apiFetch<VariantOption[]>("/api/settings/variants"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme başarısız");
    }
  }

  const filteredVariants = useMemo(() => {
    if (!varFilter) return variants;
    return variants.filter((v) => v.kind.toLowerCase() === varFilter.toLowerCase());
  }, [variants, varFilter]);

  const kindOptions = useMemo(() => {
    const fromDb = variants.map((v) => v.kind);
    return Array.from(new Set([...VARIANT_KINDS, ...fromDb]));
  }, [variants]);

  const sablonPreview = useMemo(() => {
    const baslik = settings.teklif_sablon_baslik?.trim() || "Teklif Formu";
    const alt = settings.teklif_sablon_alt_baslik?.trim() || "";
    let t = `${baslik.toUpperCase()}\n`;
    if (alt) t += `${alt}\n`;
    t += "\nÖrnek Müşteri Ltd. Şti.\nTarih: 29.05.2026\nNo: BB-0001\n\n";
    t += "Açıklama                         Miktar       Fiyat       Toplam\n";
    t += "Oversize Tişört - Beden: L, Renk: Siyah, Baskı: DTF   10      350,00 TL   3.500,00 TL\n\n";
    if (settings.teklif_sablon_toplam_goster === "Evet") {
      t += "Ara Toplam: 3.500,00 TL\nKapora: 1.000,00 TL\nKalan Ödeme: 2.500,00 TL\nGenel Toplam: 3.500,00 TL\n\n";
    }
    if (settings.teklif_sablon_sartlar_goster === "Evet") {
      t += (settings.teklif_sablon_sartlar || "").trim() + "\n\n";
    }
    t += (settings.teklif_sablon_kapanis || "").trim();
    return t;
  }, [settings]);

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

      {tab === "hizli" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[#172033] text-white px-4 py-3 flex items-center justify-between">
            <div className="font-bold text-sm tracking-wide">ANA SAYFA HIZLI İŞLEMLERİ</div>
            <div className="text-sky-300 text-sm font-bold">{hizliSet.size} işlem seçili</div>
          </div>
          <p className="text-sm text-slate-500">
            Ana ekranda sık kullandığınız işlemleri seçin. Sabit işlemler iş akışının korunması için
            kaldırılamaz.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QUICK_ACTION_CATALOG.map((a) => (
              <label
                key={a.id}
                className="rounded-lg border bg-white overflow-hidden flex cursor-pointer shadow-sm"
              >
                <div className="w-1.5 shrink-0" style={{ backgroundColor: a.hex }} />
                <div className="p-3 flex-1">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={hizliSet.has(a.id)}
                      disabled={!!a.fixed}
                      onChange={() => toggleHizli(a.id, a.fixed)}
                    />
                    <div>
                      <div className="text-sm font-bold">
                        {a.label}
                        {a.fixed ? " (Sabit)" : ""}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{a.description}</div>
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm"
              onClick={() =>
                setSettings({
                  ...settings,
                  hizli_islemler: QUICK_ACTION_CATALOG.map((a) => a.id),
                })
              }
            >
              Tümünü Seç
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() =>
                setSettings({
                  ...settings,
                  hizli_islemler: QUICK_ACTION_CATALOG.filter((a) => a.fixed).map((a) => a.id),
                })
              }
            >
              Seçimi Kaldır
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-600 text-white px-3 py-1.5 text-sm"
              onClick={() =>
                setSettings({
                  ...settings,
                  hizli_islemler: EMPTY.hizli_islemler,
                })
              }
            >
              Varsayılana Dön
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 text-white px-4 py-1.5 text-sm font-bold ml-auto"
              onClick={() => void saveSettings()}
            >
              Tüm Ayarları Kaydet
            </button>
          </div>
        </div>
      )}

      {tab === "solmenu" && (
        <div className="space-y-4">
          <fieldset className="rounded-xl border bg-white p-5 shadow-sm">
            <legend className="px-1 text-sm font-bold">Sol Menü Bölümlerinin Sırası</legend>
            <p className="text-sm text-slate-500 mb-3">
              Bölümleri sıralayın veya kullanıcıya görünen başlıklarını değiştirin. Sistem adı sabit
              kaldığı için bağlantılar etkilenmez.
            </p>
            <div className="flex gap-3">
              <div className="flex-1 overflow-hidden rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Sistem Adı</th>
                      <th className="px-3 py-2">Sol Menüde Görünen Başlık</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menuOrder.map((name, idx) => (
                      <tr
                        key={name}
                        className={`border-t cursor-pointer ${menuSel === idx ? "bg-sky-50" : ""}`}
                        onClick={() => setMenuSel(idx)}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{name}</td>
                        <td className="px-3 py-2">{settings.sol_menu_adlari?.[name] || name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => moveMenu("top")}>En Üst</button>
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => moveMenu("up")}>Yukarı</button>
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => moveMenu("down")}>Aşağı</button>
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => moveMenu("bottom")}>En Alt</button>
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={renameMenu}>Başlığı Değiştir</button>
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={resetMenuLabel}>Başlığı Sıfırla</button>
                <button
                  type="button"
                  className="rounded border px-3 py-1.5 text-sm"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      sol_menu_sirasi: [...DEFAULT_SOL_MENU_ORDER],
                      sol_menu_adlari: {},
                    })
                  }
                >
                  Varsayılan Sıra
                </button>
              </div>
            </div>
          </fieldset>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold"
            onClick={() => void saveSettings()}
          >
            Sol Menü Sıralamasını Kaydet
          </button>
        </div>
      )}

      {tab === "varyant" && (
        <div className="space-y-4">
          <form onSubmit={saveVariant} className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-sm">Varyant Ekle / Güncelle</h2>
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-500">Tür</label>
                <select
                  className={input}
                  value={varForm.kind}
                  onChange={(e) => {
                    setVarForm({ ...varForm, kind: e.target.value });
                    setVarFilter(e.target.value);
                  }}
                >
                  {kindOptions.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Değer</label>
                <input
                  className={input}
                  value={varForm.value}
                  onChange={(e) => setVarForm({ ...varForm, value: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-bold w-full">
                  Kaydet / Güncelle
                </button>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs text-slate-500">Not</label>
                <input
                  className={input}
                  value={varForm.note}
                  onChange={(e) => setVarForm({ ...varForm, note: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm w-full"
                  onClick={() => void deleteVariants()}
                >
                  Seçilenleri Sil
                </button>
              </div>
            </div>
          </form>
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between">
              <span>Kayıtlı Varyantlar</span>
              <button
                type="button"
                className="text-xs text-slate-500 hover:underline"
                onClick={() => setVarFilter("")}
              >
                Tümünü Göster
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Tür</th>
                  <th className="px-3 py-2">Değer</th>
                  <th className="px-3 py-2">Not</th>
                </tr>
              </thead>
              <tbody>
                {filteredVariants.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-t cursor-pointer ${varSelected.includes(v.id) ? "bg-sky-50" : ""}`}
                    onClick={() => {
                      setVarSelected([v.id]);
                      setVarForm({ kind: v.kind, value: v.value, note: v.note || "" });
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={varSelected.includes(v.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setVarSelected((prev) =>
                            e.target.checked ? [...prev, v.id] : prev.filter((x) => x !== v.id),
                          );
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{v.kind}</td>
                    <td className="px-3 py-2">{v.value}</td>
                    <td className="px-3 py-2 text-slate-500">{v.note || "—"}</td>
                  </tr>
                ))}
                {filteredVariants.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      Kayıtlı varyant yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "sablon" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-bold text-sm">Teklif Formu Alanları</h2>
            {field("teklif_sablon_adi", "Şablon Adı")}
            {field("teklif_sablon_baslik", "Başlık")}
            {field("teklif_sablon_alt_baslik", "Alt Başlık")}
            {(
              [
                ["teklif_sablon_logo_goster", "Logo görünsün"],
                ["teklif_sablon_musteri_goster", "Müşteri bilgileri görünsün"],
                ["teklif_sablon_urun_detay_goster", "Ürünlerde beden / renk / baskı görünsün"],
                ["teklif_sablon_toplam_goster", "Toplam bloğu görünsün"],
                ["teklif_sablon_not_goster", "Not / açıklama görünsün"],
                ["teklif_sablon_sartlar_goster", "Teklif şartları görünsün"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-slate-500">{label}</label>
                <select
                  className={input}
                  value={String(settings[key] || "Evet")}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                >
                  <option>Evet</option>
                  <option>Hayır</option>
                </select>
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-500">Teklif Şartları</label>
              <textarea
                className={input + " min-h-[120px]"}
                value={settings.teklif_sablon_sartlar || ""}
                onChange={(e) => setSettings({ ...settings, teklif_sablon_sartlar: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Kapanış Metni</label>
              <textarea
                className={input + " min-h-[80px]"}
                value={settings.teklif_sablon_kapanis || ""}
                onChange={(e) => setSettings({ ...settings, teklif_sablon_kapanis: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold"
              onClick={() => void saveSettings()}
            >
              Tüm Ayarları Kaydet
            </button>
          </div>
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-bold text-sm mb-3">Önizleme</h2>
            <pre className="whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 rounded-lg p-4 min-h-[420px] border">
              {sablonPreview}
            </pre>
          </div>
        </div>
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
            masaüstü ayarlar.json&apos;dan kopyalanmaz. BizimHesap canlı senkron (Selenium/DPAPI)
            webde devre dışı — sadece iskelet ayar.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Stub:</strong> BizimHesap canlı sync · Selenium WhatsApp Desktop · DPAPI yedek
            şifresi — harici bağımlılık / güvenlik nedeniyle kapalı.
          </div>
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
            Sunucu tarafı zip yedek ve yedek test araçları. OneDrive / Windows DPAPI yolları webde
            yok.
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
            düğmeleriyle açılır. Ayarlar sekmeleri: Genel, Hızlı İşlemler, Sol Menü, Varyant, Şablon,
            Entegrasyonlar, YARDIM.
          </p>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li>Ana Sayfa: KPI, hızlı işlemler (seçilebilir), atölye, notlar</li>
            <li>Depolar: Depolar Arası Transfer (gerçek stok bakiyesi)</li>
            <li>Ayarlar: non-secret kayıt; API key / DPAPI yok</li>
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
