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
    title: "Kampanyalar",
    href: "/crm/campaigns",
    color: "#ea580c",
    desc: "Kampanya metinleri ve toplu wa.me gönderim hazırlığı (Selenium yok).",
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
  const [counts, setCounts] = useState({
    ready: 0,
    payment_due: 0,
    design_approval: 0,
    directory: 0,
    templates: 0,
  });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [track, dir, tpls] = await Promise.all([
        apiFetch<Track>("/api/whatsapp/track").catch(() => null),
        apiFetch<unknown[]>("/api/directory").catch(() => []),
        apiFetch<unknown[]>("/api/whatsapp/templates").catch(() => []),
      ]);
      setCounts({
        ready: track?.counts?.ready || 0,
        payment_due: track?.counts?.payment_due || 0,
        design_approval: track?.counts?.design_approval || 0,
        directory: Array.isArray(dir) ? dir.length : 0,
        templates: Array.isArray(tpls) ? tpls.length : 0,
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
        <div className="flex flex-wrap gap-2">
          <Link href="/whatsapp/track" className="bk-btn text-xs text-white" style={{ background: "#15803d" }}>
            WhatsApp Takip
          </Link>
          <Link href="/crm/special-days" className="bk-btn text-xs text-white" style={{ background: "#f59e0b" }}>
            Özel Gün
          </Link>
          <Link href="/directory" className="bk-btn text-xs text-white" style={{ background: "#0f766e" }}>
            Fihrist
          </Link>
          <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-amber-50 text-amber-800 px-3 py-2 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-5 gap-2">
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
        <div className="rounded border bg-slate-50 border-slate-200 px-3 py-2">
          <div className="text-[11px] text-slate-700">WA şablon</div>
          <div className="text-xl font-bold text-slate-900">{counts.templates}</div>
        </div>
      </div>

      <div className="rounded border bg-white px-3 py-2">
        <div className="text-xs font-semibold text-baykus-muted mb-2">İşlemler (masaüstü düğme etiketleri)</div>
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/whatsapp/track", label: "WhatsApp Takip", color: "#15803d" },
            { href: "/crm/special-days", label: "Özel Gün / Kampanya", color: "#f59e0b" },
            { href: "/whatsapp", label: "WhatsApp Taslakları", color: "#16a34a" },
            { href: "/whatsapp?tab=history", label: "WhatsApp Geçmişi", color: "#64748b" },
            { href: "/directory", label: "Fihrist", color: "#0f766e" },
            { href: "/customers/track", label: "Müşteri Takibi", color: "#1f6feb" },
          ].map((b) => (
            <Link
              key={b.href + b.label}
              href={b.href}
              className="bk-btn text-xs text-white font-semibold"
              style={{ background: b.color }}
            >
              {b.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <div key={c.href + c.title} className="bk-card p-4 flex flex-col gap-3">
            <div className="font-semibold text-baykus-text">{c.title}</div>
            <p className="text-sm text-baykus-muted flex-1">{c.desc}</p>
            <Link href={c.href} className="bk-btn text-sm text-white self-start" style={{ background: c.color }}>
              Aç →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
