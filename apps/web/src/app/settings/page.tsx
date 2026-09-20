"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type UserOut = {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
};

export default function SettingsPage() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [roles, setRoles] = useState<unknown>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<UserOut[]>("/api/settings/users"),
      apiFetch("/api/settings/roles"),
    ])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ayarlar / Kullanıcılar</h1>
      <p className="text-slate-500 mb-6 text-sm">RBAC kullanıcıları ve roller</p>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
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
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{u.roles.join(", ")}</td>
                <td className="px-4 py-3">{u.is_active ? "Aktif" : "Pasif"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs overflow-auto">
        {roles ? JSON.stringify(roles, null, 2) : ""}
      </pre>
    </div>
  );
}
