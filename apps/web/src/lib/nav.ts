export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Gösterge Paneli", icon: "📊" },
  { href: "/customers", label: "Müşteriler", icon: "👥" },
  { href: "/cari", label: "Cari / Alacaklar", icon: "📒" },
  { href: "/products", label: "Ürünler", icon: "📦" },
  { href: "/stock", label: "Stok", icon: "📥" },
  { href: "/quotes", label: "Teklifler", icon: "📝" },
  { href: "/orders", label: "Siparişler", icon: "🛒" },
  { href: "/orders/kanban", label: "Kanban", icon: "📋" },
  { href: "/suppliers", label: "Tedarikçiler", icon: "🏭" },
  { href: "/purchases", label: "Satın Alma", icon: "🧾" },
  { href: "/payables", label: "Borçlar", icon: "📉" },
  { href: "/finance", label: "Finans", icon: "💰" },
  { href: "/finance/cash", label: "Kasa", icon: "💵" },
  { href: "/finance/banks", label: "Banka", icon: "🏦" },
  { href: "/reports", label: "Raporlar", icon: "📈" },
  { href: "/whatsapp", label: "WhatsApp Şablonları", icon: "💬" },
  { href: "/settings", label: "Ayarlar / Kullanıcılar", icon: "⚙️" },
];
