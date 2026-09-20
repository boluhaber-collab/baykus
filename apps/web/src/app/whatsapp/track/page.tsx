"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney } from "@/lib/api";

type Item = {
  id: number;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  design_status: string | null;
  total_amount: number;
  remaining?: number;
  delivery_date: string | null;
};

type Track = {
  ready_orders: Item[];
  payment_due: Item[];
  design_approval: Item[];
  counts: { ready: number; payment_due: number; design_approval: number };
};

function Queue({ title, color, items }: { title: string; color: string; items: Item[] }) {
  return (
    <div className="bk-card overflow-hidden">
      <div className="px-3 py-2 text-white text-sm font-semibold" style={{ background: color }}>
        {title} · {items.length}
      </div>
      <ul className="divide-y max-h-80 overflow-auto">
        {items.map((it) => (
          <li key={it.id} className="px-3 py-2 text-sm flex flex-wrap justify-between gap-2">
            <div>
              <Link href={`/orders/${it.id}`} className="font-medium text-baykus-primary hover:underline">
                {it.order_number}
              </Link>
              <div className="text-xs text-baykus-muted">{it.customer_name || "—"} · {it.customer_phone || "tel yok"}</div>
            </div>
            <div className="text-right text-xs">
              <div>{it.status}</div>
              {it.remaining != null && <div className="tabular-nums font-semibold">{formatMoney(it.remaining)}</div>}
              {it.customer_phone && (
                <a
                  className="text-emerald-700 hover:underline"
                  href={`https://wa.me/${it.customer_phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-6 text-center text-baykus-muted text-xs">Boş kuyruk</li>}
      </ul>
    </div>
  );
}

export default function WhatsAppTrackPage() {
  const [data, setData] = useState<Track | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiFetch<Track>("/api/whatsapp/track"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">WhatsApp Takip Merkezi</h2>
          <p className="text-xs text-baykus-muted">Hazır sipariş · ödeme bekleyen · tasarım onayı</p>
        </div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>Yenile</button>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="grid lg:grid-cols-3 gap-3">
        <Queue title="Hazır / Baskıda" color="#15803d" items={data?.ready_orders || []} />
        <Queue title="Ödeme Bekleyen" color="#be123c" items={data?.payment_due || []} />
        <Queue title="Tasarım Onayı" color="#1f6feb" items={data?.design_approval || []} />
      </div>
    </div>
  );
}
