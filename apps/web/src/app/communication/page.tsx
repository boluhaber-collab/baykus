"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const CARDS = [
  {
    title: "WhatsApp Takip",
    href: "/whatsapp/track",
    color: "#15803d",
    desc: "Hazır sipariş, ödeme ve tasarım onayı bekleyen müşterileri takip edin.",
  },
  {
    title: "Özel Gün / Kampanya",
    href: "/crm/special-days",
    color: "#f59e0b",
    desc: "Özel gün listelerini yönetin ve seçili müşterilere toplu mesaj hazırlayın.",
  },
  {
    title: "Taslaklar",
    href: "/whatsapp",
    color: "#16a34a",
    desc: "Sık kullanılan WhatsApp mesaj metinlerini oluşturun ve güncelleyin.",
  },
  {
    title: "Geçmiş",
    href: "/whatsapp?tab=history",
    color: "#64748b",
    desc: "Gönderime açılan WhatsApp mesajlarının işlem geçmişini inceleyin.",
  },
  {
    title: "Fihrist",
    href: "/directory",
    color: "#0f766e",
    desc: "Müşteri ve tedarikçi iletişim bilgilerine tek rehberden ulaşın.",
  },
];

type Track = { counts: { ready: number; payment_due: number; design_approval: number } };

export default function CommunicationHubPage() {
  const [counts, setCounts] = useState({ ready: 0, payment_due: 0, design_approval: 0, directory: 0 });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [track, dir] = await Promise.all([
        apiFetch<Track>("/api/whatsapp/track").catch(() => null),
        apiFetch<unknown[]>("/api/directory").catch(() => []),
      ]);
      setCounts({
        ready: track?.counts?.ready || 0,
        payment_due: track?.counts?.payment_due || 0,
        design_approval: track?.counts?.design_approval || 0,
        directory: Array.isArray(dir) ? dir.length : 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Özet yüklenemedi");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Müşteri İletişim</h2>
          <p className="text-sm text-baykus-muted">
            Müşteri iletişimi, kampanyalar, mesaj taslakları ve rehber — Selenium yok, wa.me + taslak.
          </p>
        </div>
        <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
          Yenile
        </button>
      </div>

      {error && <div className="rounded bg-amber-50 text-amber-800 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-4 gap-2">
        <div className="rounded border bg-emerald-50 border-emerald-200 px-3 py-2">
          <div className="text-[11px] text-emerald-800">Hazır / Baskıda</div>
          <div className="text-xl font-bold text-emerald-900">{counts.ready}</div>
        </div>
        <div className="rounded border bg-rose-50 border-rose-200 px-3 py-2">
          <div className="text-[11px] text-rose-800">Ödeme bekleyen</div>
          <div className="text-xl font-bold text-rose-900">{counts.payment_due}</div>
        </div>
        <div className="rounded border bg-sky-50 border-sky-200 px-3 py-2">
          <div className="text-[11px] text-sky-800">Tasarım onayı</div>
          <div className="text-xl font-bold text-sky-900">{counts.design_approval}</div>
        </div>
        <div className="rounded border bg-teal-50 border-teal-200 px-3 py-2">
          <div className="text-[11px] text-teal-800">Fihrist kartı</div>
          <div className="text-xl font-bold text-teal-900">{counts.directory}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <div key={c.href} className="bk-card p-4 flex flex-col gap-3">
            <div className="font-semibold text-baykus-text">{c.title}</div>
            <p className="text-sm text-baykus-muted flex-1">{c.desc}</p>
            <Link
              href={c.href}
              className="bk-btn text-sm text-white self-start"
              style={{ background: c.color }}
            >
              Aç →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
