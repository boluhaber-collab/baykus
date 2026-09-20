"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppSettings, apiFetch } from "@/lib/api";

type UserOut = {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
};

const ROLE_OPTIONS = ["admin", "satış", "üretim", "muhasebe"];

export default function SettingsPage() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [roles, setRoles] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    company_name: "",
    phone: "",
    theme_label: "",
  });
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
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (admin gerekir)");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      const s = await apiFetch<AppSettings>("/api/settings/app", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(s);
      setMsg("Uygulama ayarları kaydedildi");
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

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/settings/integrations" className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Entegrasyonlar</a>
        <a href="/settings/backups" className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Yedekleme</a>
        <a href="/settings/audit" className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Denetim kaydı</a>
      </div>

      <h1 className="text-2xl font-bold mb-1">Ayarlar / Kullanıcılar</h1>
      <p className="text-slate-500 text-sm mb-6">Kullanıcılar · roller · şirket ayarları</p>
      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {msg && <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{msg}</div>}

      <form
        onSubmit={saveSettings}
        className="rounded-xl border bg-white p-5 shadow-sm mb-6 grid md:grid-cols-3 gap-4"
      >
        <div>
          <label className="text-xs text-slate-500">Şirket adı</label>
          <input
            className={input}
            value={settings.company_name}
            onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Telefon</label>
          <input
            className={input}
            value={settings.phone}
            onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Tema etiketi</label>
          <input
            className={input}
            value={settings.theme_label}
            onChange={(e) => setSettings({ ...settings, theme_label: e.target.value })}
          />
        </div>
        <div className="md:col-span-3">
          <button type="submit" className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm">
            Ayarları Kaydet
          </button>
        </div>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden mb-6">
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
  );
}
