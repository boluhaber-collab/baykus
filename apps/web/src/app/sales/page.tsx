"use client";

import Link from "next/link";
import { HubSection } from "@/components/hub/HubChrome";

/** Desktop satis_siparis_modul_items */
const MODULE_ITEMS = [
  { href: "/orders", title: "Sipariş Merkezi", desc: "Teklif / sipariş defteri ve filtreler", color: "#1e3a8a" },
  { href: "/orders", title: "Satışlar", desc: "Satış belgeleri ve sipariş listesi", color: "#0f766e" },
  { href: "/sales/create", title: "Satış / Teklif Oluştur", desc: "Hızlı satış ve teklif formu", color: "#1f6feb" },
  { href: "/sales/create?type=perakende", title: "Perakende", desc: "Perakende satış ekranı", color: "#198754" },
  { href: "/quotes", title: "Teklifler", desc: "Teklif listesi ve PDF", color: "#7c3aed" },
  { href: "/orders", title: "Sipariş Listesi", desc: "Tüm siparişler", color: "#0f766e" },
  { href: "/orders?status=Teslim%20Edildi", title: "Teslim Edilen", desc: "Tamamlanan siparişler", color: "#15803d" },
  { href: "/orders/kanban", title: "Yaşam Çizgisi", desc: "Kanban üretim akışı", color: "#f59e0b" },
] as const;

export default function SalesHubPage() {
  return (
    <HubSection title="Satış / Sipariş">
      <p className="text-xs text-baykus-muted -mt-1 mb-1">
        Masaüstü Satış / Sipariş modül düğümleri
      </p>
      <div className="bk-hub-grid">
        {MODULE_ITEMS.map((l) => (
          <Link
            key={l.title + l.href}
            href={l.href}
            className="bk-hub-card border-l-4"
            style={{ borderLeftColor: l.color }}
          >
            <span className="title" style={{ color: l.color }}>
              {l.title}
            </span>
            <span className="desc">{l.desc}</span>
          </Link>
        ))}
      </div>
    </HubSection>
  );
}
