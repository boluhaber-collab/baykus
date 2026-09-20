"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

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

export default function CustomerTrackPage() {
  const [items, setItems] = useState<Event[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await apiFetch<Event[]>("/api/customers/track?limit=80"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Müşteri Takibi</h2>
          <p className="text-xs text-baykus-muted">Son siparişler ve cari ödemeler</p>
        </div>
        <Link href="/customers" className="bk-btn bk-btn-ghost text-xs">
          Müşteri listesi
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <ol className="relative border-l border-slate-200 ml-3 space-y-3">
        {items.map((ev, i) => (
          <li key={i} className="ml-4">
            <span
              className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${
                ev.type === "payment" ? "bg-emerald-300" : "bg-sky-300"
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
    </div>
  );
}
