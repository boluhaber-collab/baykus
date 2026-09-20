"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Event = {
  type: string;
  at: string | null;
  label: string;
  detail?: string | null;
  amount?: number;
  method?: string;
};

type Timeline = {
  order_id: number;
  order_number: string;
  status: string;
  events: Event[];
};

const typeColor: Record<string, string> = {
  created: "bg-slate-200",
  status: "bg-amber-200",
  payment: "bg-emerald-200",
  design: "bg-sky-200",
  design_status: "bg-violet-200",
};

export default function OrderTimelinePage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<Timeline | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      setData(await apiFetch<Timeline>(`/api/orders/${id}/timeline`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Sipariş Yaşam Çizgisi</h2>
          <p className="text-xs text-baykus-muted">
            {data ? (
              <>
                {data.order_number} · {data.status}
              </>
            ) : (
              "Durum geçmişi + ödemeler + tasarım"
            )}
          </p>
        </div>
        <Link href={`/orders/${id}`} className="bk-btn bk-btn-ghost text-xs">
          Sipariş detay
        </Link>
      </div>
      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <ol className="relative border-l border-slate-200 ml-3 space-y-4">
        {(data?.events || []).map((ev, i) => (
          <li key={i} className="ml-4">
            <span
              className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${typeColor[ev.type] || "bg-slate-300"}`}
            />
            <div className="text-[11px] text-baykus-muted">
              {ev.at ? new Date(ev.at).toLocaleString("tr-TR") : "—"} · {ev.type}
            </div>
            <div className="text-sm font-medium">{ev.label}</div>
            {ev.detail && <div className="text-xs text-baykus-muted">{ev.detail}</div>}
          </li>
        ))}
        {data && data.events.length === 0 && (
          <li className="ml-4 text-sm text-baykus-muted">Henüz olay yok</li>
        )}
      </ol>
    </div>
  );
}
