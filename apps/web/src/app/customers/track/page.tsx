"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Customer, apiFetch, formatMoney } from "@/lib/api";

type Event = {
  type: string;
  at: string | null;
  customer_id: number | null;
  customer_name: string | null;
  label: string;
  detail: string | null;
  amount: number;
  href: string;
};

type TrackPayload = {
  events: Event[];
  receivables: {
    customer_id: number;
    name: string;
    phone: string | null;
    balance: number;
    notes: string | null;
    special_day_note: string | null;
    special_day_date: string | null;
  }[];
  focus: {
    id: number;
    name: string;
    phone: string | null;
    company: string | null;
    notes: string | null;
    special_day_note: string | null;
    special_day_date: string | null;
    balance: number;
  } | null;
  summary: {
    event_count: number;
    receivable_count: number;
    receivable_total: number;
  };
};

export default function CustomerTrackPage() {
  const [data, setData] = useState<TrackPayload | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"timeline" | "receivables" | "notes">("timeline");

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (customerId) params.set("customer_id", customerId);
      const [track, cust] = await Promise.all([
        apiFetch<TrackPayload>(`/api/customers/track?${params}`),
        apiFetch<Customer[]>("/api/customers"),
      ]);
      setData(track);
      setCustomers(cust);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.events || [];
  const receivables = data?.receivables || [];
  const focus = data?.focus;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Müşteri Takibi</h2>
          <p className="text-xs text-baykus-muted">Timeline · açık alacaklar · notlar</p>
        </div>
        <div className="flex gap-2">
          <Link href="/customers/receivables" className="bk-btn bk-btn-ghost text-xs">
            Açık Alacaklar
          </Link>
          <Link href="/customers" className="bk-btn bk-btn-ghost text-xs">
            Müşteri listesi
          </Link>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="bk-filter-bar">
        <select className="bk-input max-w-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— Tüm müşteriler —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.phone ? ` | ${c.phone}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Yenile
        </button>
      </div>

      {data?.summary && (
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Hareket</div>
            <div className="text-xl font-bold">{data.summary.event_count}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Açık alacaklı</div>
            <div className="text-xl font-bold text-amber-700">{data.summary.receivable_count}</div>
          </div>
          <div className="bk-card px-3 py-2">
            <div className="text-[11px] text-baykus-muted">Alacak toplam</div>
            <div className="text-xl font-bold tabular-nums text-red-700">
              {formatMoney(data.summary.receivable_total)}
            </div>
          </div>
        </div>
      )}

      {focus && (
        <div className="rounded border bg-white p-3 text-sm">
          <div className="font-semibold">{focus.name}</div>
          <div className="text-xs text-baykus-muted">
            {focus.company || "—"} · {focus.phone || "tel yok"} · Bakiye:{" "}
            <strong className="tabular-nums">{formatMoney(focus.balance)}</strong>
          </div>
          {(focus.notes || focus.special_day_note) && (
            <div className="mt-2 text-xs bg-amber-50 rounded px-2 py-1">
              {focus.special_day_note && (
                <div>
                  Özel: {focus.special_day_note}
                  {focus.special_day_date ? ` (${focus.special_day_date})` : ""}
                </div>
              )}
              {focus.notes && <div className="mt-1 whitespace-pre-wrap">{focus.notes}</div>}
            </div>
          )}
          <Link href={`/customers/${focus.id}`} className="text-xs text-baykus-primary hover:underline mt-1 inline-block">
            Cari kartı →
          </Link>
        </div>
      )}

      <div className="flex gap-2">
        {(
          [
            ["timeline", "Yaşam çizgisi"],
            ["receivables", "Alacaklar"],
            ["notes", "Notlar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1.5 text-xs font-semibold border ${
              tab === id ? "bg-baykus-primary text-white border-baykus-primary" : "bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "timeline" && (
        <ol className="relative border-l border-slate-200 ml-3 space-y-3">
          {items.map((ev, i) => (
            <li key={i} className="ml-4">
              <span
                className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${
                  ev.type === "payment" || ev.type === "deposit" ? "bg-emerald-300" : "bg-sky-300"
                }`}
              />
              <div className="text-[11px] text-baykus-muted">
                {ev.at ? new Date(ev.at).toLocaleString("tr-TR") : "—"} · {ev.type}
              </div>
              <div className="text-sm">
                <Link href={ev.href} className="text-baykus-primary hover:underline font-medium">
                  {ev.label}
                </Link>
                {ev.customer_name && (
                  <>
                    {" · "}
                    <Link
                      href={ev.customer_id ? `/customers/${ev.customer_id}` : "/customers"}
                      className="hover:underline"
                    >
                      {ev.customer_name}
                    </Link>
                  </>
                )}
              </div>
              <div className="text-xs text-baykus-muted">
                {ev.detail || ""}
                {ev.amount ? ` · ${formatMoney(ev.amount)}` : ""}
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="ml-4 text-sm text-baykus-muted">Henüz hareket yok</li>}
        </ol>
      )}

      {tab === "receivables" && (
        <div className="bk-table-wrap">
          <table className="bk-table">
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Telefon</th>
                <th className="text-right">Bakiye</th>
                <th>Özel not</th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((r) => (
                <tr key={r.customer_id}>
                  <td>
                    <Link href={`/customers/${r.customer_id}`} className="text-baykus-primary hover:underline font-medium">
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-xs">{r.phone || "—"}</td>
                  <td className="text-right tabular-nums font-semibold text-red-700">{formatMoney(r.balance)}</td>
                  <td className="text-xs text-baykus-muted">{r.special_day_note || "—"}</td>
                </tr>
              ))}
              {receivables.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-baykus-muted py-8">
                    Açık alacak yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-2">
          {receivables
            .filter((r) => r.notes || r.special_day_note)
            .map((r) => (
              <div key={r.customer_id} className="rounded border bg-white p-3 text-sm">
                <Link href={`/customers/${r.customer_id}`} className="font-semibold text-baykus-primary hover:underline">
                  {r.name}
                </Link>
                {r.special_day_note && (
                  <div className="text-xs text-amber-800 mt-1">
                    Özel: {r.special_day_note}
                    {r.special_day_date ? ` · ${r.special_day_date}` : ""}
                  </div>
                )}
                {r.notes && <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{r.notes}</div>}
              </div>
            ))}
          {receivables.filter((r) => r.notes || r.special_day_note).length === 0 && (
            <p className="text-sm text-baykus-muted">
              {customerId
                ? "Bu müşteride not yok (cari kartından ekleyebilirsiniz)."
                : "Notlu müşteri yok — müşteri seçin veya cari kartına not ekleyin."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
