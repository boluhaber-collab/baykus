"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuditLog, apiFetch } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";

const ENTITY_PRESETS = [
  "",
  "order",
  "quote",
  "customer",
  "product",
  "supplier",
  "purchase",
  "loan",
  "asset",
  "expense",
  "payment",
  "user",
  "settings",
];

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [action, entityType, entityId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter((row) => {
      const hay = `${row.user_name || ""} ${row.user_email || ""} ${row.action} ${row.entity_type} ${row.entity_id || ""} ${row.detail || ""}`.toLocaleLowerCase("tr");
      return hay.includes(needle);
    });
  }, [items, q]);

  const summary = useMemo(() => {
    const creates = filtered.filter((r) => r.action === "create").length;
    const updates = filtered.filter((r) => r.action === "update").length;
    const deletes = filtered.filter((r) => r.action === "delete").length;
    return { total: filtered.length, creates, updates, deletes };
  }, [filtered]);

  function clearFilters() {
    setAction("");
    setEntityType("");
    setEntityId("");
    setFromDate("");
    setToDate("");
    setQ("");
  }

  function actionBadge(a: string) {
    if (a === "create") return "bg-emerald-100 text-emerald-800";
    if (a === "delete") return "bg-red-100 text-red-800";
    if (a === "update") return "bg-sky-100 text-sky-800";
    return "bg-slate-100 text-slate-700";
  }

  return (
    <div className="space-y-2 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/settings" className="text-xs text-baykus-primary hover:underline">
            ← Ayarlar
          </Link>
          <h1 className="text-lg font-bold mt-1 leading-tight">İşlem Geçmişi</h1>
          <p className="text-[11px] text-baykus-muted">Sistem › İşlem Geçmişi · create / update / delete (admin)</p>
        </div>
        <button type="button" onClick={() => void load()} className="bk-btn bk-btn-ghost text-xs">
          ↻ Yenile
        </button>
      </div>

      <div className="bk-kpi-strip">
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Toplam Kayıt</div>
            <div className="bk-kpi-value">{summary.total}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#198754" }}>
          <span className="bk-kpi-icon">＋</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Create</div>
            <div className="bk-kpi-value">{summary.creates}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#2563eb" }}>
          <span className="bk-kpi-icon">✎</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Update</div>
            <div className="bk-kpi-value">{summary.updates}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#dc2626" }}>
          <span className="bk-kpi-icon">✕</span>
          <div className="flex-1 text-right">
            <div className="bk-kpi-label">Delete</div>
            <div className="bk-kpi-value">{summary.deletes}</div>
          </div>
        </div>
      </div>

      <fieldset className="rounded border border-baykus-line bg-white px-3 py-2">
        <legend className="px-1 text-xs font-bold">Filtreler</legend>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={action} onChange={(e) => setAction(e.target.value)} className="bk-input w-auto">
            <option value="">Tüm aksiyonlar</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
          </select>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="bk-input w-auto min-w-[9rem]"
          >
            <option value="">Tüm varlıklar</option>
            {ENTITY_PRESETS.filter(Boolean).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="entity_id"
            className="bk-input w-28"
          />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bk-input w-auto" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bk-input w-auto" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Detay / kullanıcı ara…"
            className="bk-input max-w-xs"
          />
          <button type="button" onClick={() => void load()} className="bk-btn bk-btn-primary text-xs">
            Filtrele
          </button>
          <button type="button" onClick={clearFilters} className="bk-btn bk-btn-ghost text-xs">
            Temizle
          </button>
        </div>
      </fieldset>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {loading && <p className="text-xs text-baykus-muted">Yükleniyor…</p>}

      <fieldset className="rounded border border-baykus-line bg-white px-2 py-2">
        <legend className="px-1 text-xs font-bold">Kayıt Listesi</legend>
        <div className="bk-table-wrap border-0">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Kullanıcı</th>
                <th>Aksiyon</th>
                <th>Varlık</th>
                <th>Detay</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-xs text-baykus-muted">
                    {new Date(row.created_at).toLocaleString("tr-TR")}
                  </td>
                  <td className="text-xs">{row.user_name || row.user_email || row.user_id || "—"}</td>
                  <td>
                    <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${actionBadge(row.action)}`}>
                      {row.action}
                    </span>
                  </td>
                  <td className="text-xs font-mono">
                    {row.entity_type}
                    {row.entity_id ? ` #${row.entity_id}` : ""}
                  </td>
                  <td className="text-xs text-baykus-muted max-w-md break-all">{row.detail || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="text-center text-baykus-muted py-10">
                    Kayıt yok — filtreleri temizleyip yeniden deneyin
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      <p className="text-[11px] text-baykus-muted">
        Audit log salt okunurdur. Silme / düzenleme yapılmaz. Yalnızca admin rolü görüntüleyebilir.
      </p>
      <StatusFooter onRefresh={load} />
    </div>
  );
}
