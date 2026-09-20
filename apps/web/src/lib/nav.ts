export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Gösterge Paneli", icon: "📊" },
  { href: "/customers", label: "Müşteriler", icon: "👥" },
  { href: "/cari", label: "Cari / Alacaklar", icon: "📒" },
  { href: "/crm/special-days", label: "Özel günler", icon: "🎂" },
  { href: "/crm/campaigns", label: "Kampanyalar", icon: "📣" },
  { href: "/products", label: "Ürünler", icon: "📦" },
  { href: "/stock", label: "Stok", icon: "📥" },
  { href: "/price-lists", label: "Fiyat listeleri", icon: "🏷️" },
  { href: "/quotes", label: "Teklifler", icon: "📝" },
  { href: "/orders", label: "Siparişler", icon: "🛒" },
  { href: "/orders/kanban", label: "Kanban", icon: "📋" },
  { href: "/suppliers", label: "Tedarikçiler", icon: "🏭" },
  { href: "/purchases", label: "Satın Alma", icon: "🧾" },
  { href: "/payables", label: "Borçlar", icon: "📉" },
  { href: "/finance", label: "Finans", icon: "💰" },
  { href: "/finance/cash", label: "Kasa", icon: "💵" },
  { href: "/finance/banks", label: "Banka", icon: "🏦" },
  { href: "/finance/expenses", label: "Giderler", icon: "🧾" },
  { href: "/finance/loans", label: "Kredi / Taksit", icon: "💳" },
  { href: "/finance/assets", label: "Sabit kıymetler", icon: "🏢" },
  { href: "/tools/dtf", label: "DTF maliyet", icon: "🖨️" },
  { href: "/reports", label: "Raporlar", icon: "📈" },
  { href: "/whatsapp", label: "WhatsApp Şablonları", icon: "💬" },
  { href: "/settings", label: "Ayarlar / Kullanıcılar", icon: "⚙️" },
  { href: "/settings/integrations", label: "Entegrasyonlar", icon: "🔌" },
  { href: "/settings/backups", label: "Yedekleme", icon: "💾" },
  { href: "/settings/audit", label: "Denetim kaydı", icon: "📜" },
];
