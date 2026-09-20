"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuditLog, apiFetch } from "@/lib/api";

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entityType) params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const qs = params.toString();
      setItems(await apiFetch<AuditLog[]>(`/api/audit${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası (yalnızca admin)");
    }
  }, [action, entityType, entityId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-baykus-600 hover:underline">
          ← Ayarlar
        </Link>
        <h1 className="text-2xl font-bold mt-2">Denetim kaydı</h1>
        <p className="text-sm text-slate-500">Admin — create / update / delete günlükleri</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">Tüm aksiyonlar</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
        </select>
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="entity_type (order, quote…)"
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="entity_id"
          className="rounded-lg border px-3 py-2 text-sm w-28"
        />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
        <button onClick={load} className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm">
          Filtrele
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Zaman</th>
              <th className="px-4 py-3">Kullanıcı</th>
              <th className="px-4 py-3">Aksiyon</th>
              <th className="px-4 py-3">Varlık</th>
              <th className="px-4 py-3">Detay</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                  {new Date(row.created_at).toLocaleString("tr-TR")}
                </td>
                <td className="px-4 py-3">
                  {row.user_name || row.user_email || row.user_id || "—"}
                </td>
                <td className="px-4 py-3 font-medium">{row.action}</td>
                <td className="px-4 py-3">
                  {row.entity_type}
                  {row.entity_id ? ` #${row.entity_id}` : ""}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-md break-all">
                  {row.detail || "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Kayıt yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
