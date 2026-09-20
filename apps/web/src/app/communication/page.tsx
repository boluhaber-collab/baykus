"use client";

import Link from "next/link";

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

export default function CommunicationHubPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Müşteri İletişim</h2>
        <p className="text-sm text-baykus-muted">
          Müşteri iletişimi, kampanyalar, mesaj taslakları ve rehber işlemleri tek merkezde.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <div key={c.href} className="bk-card p-4 flex flex-col gap-3">
            <div className="font-semibold text-baykus-text">{c.title}</div>
            <p className="text-xs text-baykus-muted flex-1">{c.desc}</p>
            <Link
              href={c.href}
              className="inline-flex w-fit items-center rounded px-4 py-1.5 text-sm text-white"
              style={{ background: c.color }}
            >
              Aç
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
