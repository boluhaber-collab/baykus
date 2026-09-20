"use client";

import Link from "next/link";

const LINKS = [
  {
    href: "/sales/create",
    title: "Satış / Teklif Oluştur",
    desc: "Perakende, müşteri, internet siparişi veya teklif",
    primary: true,
  },
  { href: "/orders", title: "Sipariş Merkezi", desc: "Tüm sipariş listesi ve filtreler" },
  { href: "/orders/kanban", title: "Sipariş Kanban", desc: "Durum panosu" },
  { href: "/quotes", title: "Teklifler", desc: "Teklif listesi ve PDF" },
  { href: "/orders/new", title: "Klasik sipariş formu", desc: "Detaylı sipariş oluşturma" },
  { href: "/ecommerce", title: "E-Ticaret siparişleri", desc: "İnternet kanalı filtreli" },
];

export default function SalesHubPage() {
  return (
    <div>
      <h2 className="text-base font-bold mb-1">Satış / Sipariş Merkezi</h2>
      <p className="text-xs text-baykus-muted mb-4">
        Masaüstü Satış / Sipariş menüsüne karşılık gelen giriş noktaları
      </p>
      <div className="bk-hub-grid">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`bk-hub-card ${l.primary ? "border-baykus-primary bg-blue-50/50" : ""}`}
          >
            <span className="title">{l.title}</span>
            <span className="desc">{l.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
