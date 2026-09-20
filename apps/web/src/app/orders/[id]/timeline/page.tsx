"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatMoney, statusBadgeClass } from "@/lib/api";

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
  created: "bg-slate-400",
  status: "bg-amber-500",
  payment: "bg-emerald-500",
  design: "bg-sky-500",
  design_status: "bg-violet-500",
};

const typeLabel: Record<string, string> = {
  created: "Oluşturma",
  status: "Durum",
  payment: "Ödeme",
  design: "Tasarım",
  design_status: "Tasarım durumu",
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

  const payments = (data?.events || []).filter((e) => e.type === "payment");
  const paidSum = payments.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Sipariş Yaşam Çizgisi</h2>
          <p className="text-xs text-baykus-muted">
            Satış / Sipariş › Yaşam Çizgisi · durum geçmişi + ödemeler + tasarım
          </p>
          {data && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <strong>{data.order_number}</strong>
              <span className={`inline-block rounded px-2 py-0.5 text-[11px] ${statusBadgeClass(data.status)}`}>
                {data.status}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/orders/${id}`} className="bk-btn bk-btn-ghost text-xs">
            Sipariş detay
          </Link>
          <Link href="/orders/kanban" className="bk-btn text-xs text-white" style={{ background: "#334155" }}>
            Kanban
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded border bg-white px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Olay</div>
          <div className="text-lg font-bold">{data?.events?.length ?? 0}</div>
        </div>
        <div className="rounded border bg-emerald-50 border-emerald-200 px-3 py-2">
          <div className="text-[11px] text-emerald-800">Ödeme kaydı</div>
          <div className="text-lg font-bold text-emerald-900">{payments.length}</div>
        </div>
        <div className="rounded border bg-emerald-50 border-emerald-200 px-3 py-2">
          <div className="text-[11px] text-emerald-800">Tahsilat toplam</div>
          <div className="text-lg font-bold text-emerald-900 tabular-nums">{formatMoney(paidSum)}</div>
        </div>
      </div>

      <ol className="relative border-l border-slate-200 ml-3 space-y-4">
        {(data?.events || []).map((ev, i) => (
          <li key={i} className="ml-4">
            <span
              className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${typeColor[ev.type] || "bg-slate-300"}`}
            />
            <div className="text-[11px] text-baykus-muted">
              {ev.at ? new Date(ev.at).toLocaleString("tr-TR") : "—"} · {typeLabel[ev.type] || ev.type}
            </div>
            <div className="text-sm font-medium">{ev.label}</div>
            {ev.detail && <div className="text-xs text-baykus-muted">{ev.detail}</div>}
            {(ev.amount != null || ev.method) && (
              <div className="text-xs mt-0.5">
                {ev.amount != null && (
                  <span className="font-semibold tabular-nums text-emerald-700">{formatMoney(Number(ev.amount))}</span>
                )}
                {ev.method && <span className="text-baykus-muted ml-2">{ev.method}</span>}
              </div>
            )}
          </li>
        ))}
        {data && data.events.length === 0 && (
          <li className="ml-4 text-sm text-baykus-muted">Henüz olay yok</li>
        )}
      </ol>
    </div>
  );
}
