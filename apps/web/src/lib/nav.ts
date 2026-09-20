export type NavLeaf = {
  href: string;
  label: string;
  icon?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: string;
  /** Hub or primary link when the group header is clicked */
  href?: string;
  items: NavLeaf[];
  /** If true, group starts expanded */
  defaultOpen?: boolean;
};

/** Desktop Baykuş Baskı v2.34 left menu order */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Ana Sayfa",
    icon: "🏠",
    href: "/dashboard",
    items: [],
  },
  {
    id: "customers",
    label: "Müşteri Merkezi",
    icon: "👥",
    href: "/customers",
    items: [
      { href: "/customers", label: "Müşteri listesi" },
      { href: "/customers/new", label: "Yeni müşteri" },
      { href: "/cari", label: "Cari / Alacaklar" },
      { href: "/customers/receivables", label: "Açık alacaklar" },
      { href: "/crm/special-days", label: "Özel günler" },
      { href: "/crm/campaigns", label: "Kampanyalar" },
    ],
  },
  {
    id: "suppliers",
    label: "Tedarik Merkezi",
    icon: "🏭",
    href: "/suppliers",
    items: [
      { href: "/suppliers", label: "Tedarikçiler" },
      { href: "/purchases", label: "Alış hareketleri" },
      { href: "/purchases/new", label: "Yeni satın alma" },
      { href: "/payables", label: "Borçlar" },
      { href: "/suppliers/payables", label: "Tedarikçi borçları" },
    ],
  },
  {
    id: "products",
    label: "Ürün & Stok Merkezi",
    icon: "📦",
    href: "/products",
    items: [
      { href: "/products", label: "Ürünler" },
      { href: "/products/new", label: "Yeni ürün" },
      { href: "/stock", label: "Stok özeti" },
      { href: "/stock/critical", label: "Kritik stok" },
    ],
  },
  {
    id: "sales",
    label: "Satış / Sipariş",
    icon: "🛒",
    href: "/sales",
    defaultOpen: true,
    items: [
      { href: "/sales", label: "Satış merkezi" },
      { href: "/sales/create", label: "Satış / Teklif Oluştur" },
      { href: "/orders", label: "Sipariş listesi" },
      { href: "/orders/kanban", label: "Sipariş Kanban" },
      { href: "/quotes", label: "Teklifler" },
      { href: "/orders/new", label: "Klasik sipariş formu" },
    ],
  },
  {
    id: "production",
    label: "Üretim / Atölye",
    icon: "🔧",
    href: "/production",
    items: [
      { href: "/production", label: "Atölye paneli" },
      { href: "/orders/kanban", label: "Üretim Kanban" },
      { href: "/orders", label: "Açık siparişler" },
    ],
  },
  {
    id: "ecommerce",
    label: "E-Ticaret",
    icon: "🌐",
    href: "/ecommerce",
    items: [
      { href: "/ecommerce", label: "İnternet siparişleri" },
      { href: "/sales/create?type=internet", label: "Yeni internet siparişi" },
    ],
  },
  {
    id: "finance",
    label: "Finans",
    icon: "💰",
    href: "/finance",
    items: [
      { href: "/finance", label: "Finans özeti" },
      { href: "/finance/cash", label: "Kasa" },
      { href: "/finance/banks", label: "Banka" },
      { href: "/finance/expenses", label: "Gider takibi" },
      { href: "/finance/loans", label: "Kredi / Taksit" },
      { href: "/finance/assets", label: "Sabit kıymetler" },
    ],
  },
  {
    id: "pricing",
    label: "Fiyat / Maliyet",
    icon: "🏷️",
    href: "/price-lists",
    items: [
      { href: "/price-lists", label: "Fiyat listeleri" },
      { href: "/tools/dtf", label: "DTF maliyet" },
    ],
  },
  {
    id: "reports",
    label: "Raporlar",
    icon: "📈",
    href: "/reports",
    items: [
      { href: "/reports", label: "Rapor merkezi" },
      { href: "/reports/sales", label: "Satış" },
      { href: "/reports/stock", label: "Stok" },
      { href: "/reports/finance", label: "Finans" },
      { href: "/reports/receivables", label: "Alacaklar" },
      { href: "/reports/payables", label: "Borçlar" },
      { href: "/reports/profit", label: "Kâr" },
    ],
  },
  {
    id: "comms",
    label: "Müşteri İletişim",
    icon: "💬",
    href: "/whatsapp",
    items: [
      { href: "/whatsapp", label: "WhatsApp şablonları" },
      { href: "/crm/campaigns", label: "Kampanyalar" },
      { href: "/crm/special-days", label: "Özel günler" },
    ],
  },
  {
    id: "documents",
    label: "Evrak Dolabı",
    icon: "📁",
    href: "/documents",
    items: [{ href: "/documents", label: "Dosya listesi" }],
  },
  {
    id: "system",
    label: "Sistem",
    icon: "⚙️",
    href: "/settings",
    items: [
      { href: "/settings", label: "Ayarlar / Kullanıcılar" },
      { href: "/settings/integrations", label: "Entegrasyonlar" },
      { href: "/settings/backups", label: "Yedekleme" },
      { href: "/settings/audit", label: "Denetim kaydı" },
      { href: "/settings/health", label: "Sistem sağlığı" },
    ],
  },
];

/** Flat list for active-path matching */
export const NAV_FLAT: NavLeaf[] = NAV_GROUPS.flatMap((g) => {
  const leaves = [...g.items];
  if (g.href && !leaves.some((i) => i.href === g.href)) {
    leaves.unshift({ href: g.href, label: g.label });
  }
  return leaves;
});

export type Crumb = { label: string; href?: string };

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Ana Sayfa",
  "/sales": "Satış Merkezi",
  "/sales/create": "Satış / Teklif Oluştur",
  "/production": "Üretim / Atölye",
  "/ecommerce": "E-Ticaret",
  "/documents": "Evrak Dolabı",
  "/customers": "Müşteriler",
  "/customers/new": "Yeni müşteri",
  "/customers/receivables": "Açık alacaklar",
  "/cari": "Cari / Alacaklar",
  "/products": "Ürünler",
  "/products/new": "Yeni ürün",
  "/stock": "Stok",
  "/stock/critical": "Kritik stok",
  "/orders": "Sipariş listesi",
  "/orders/new": "Yeni sipariş",
  "/orders/kanban": "Kanban",
  "/quotes": "Teklifler",
  "/quotes/new": "Yeni teklif",
  "/suppliers": "Tedarikçiler",
  "/purchases": "Alış hareketleri",
  "/payables": "Borçlar",
  "/finance": "Finans",
  "/finance/cash": "Kasa",
  "/finance/banks": "Banka",
  "/finance/expenses": "Giderler",
  "/finance/loans": "Kredi / Taksit",
  "/finance/assets": "Sabit kıymetler",
  "/price-lists": "Fiyat listeleri",
  "/tools/dtf": "DTF maliyet",
  "/reports": "Raporlar",
  "/whatsapp": "WhatsApp",
  "/crm/special-days": "Özel günler",
  "/crm/campaigns": "Kampanyalar",
  "/settings": "Ayarlar",
  "/settings/integrations": "Entegrasyonlar",
  "/settings/backups": "Yedekleme",
  "/settings/audit": "Denetim",
  "/settings/health": "Sistem sağlığı",
};

function findGroupForPath(pathname: string): NavGroup | null {
  let best: NavGroup | null = null;
  let bestLen = -1;
  for (const g of NAV_GROUPS) {
    const candidates = [
      g.href,
      ...g.items.map((i) => i.href.split("?")[0]),
    ].filter(Boolean) as string[];
    for (const href of candidates) {
      if (pathname === href || pathname.startsWith(href + "/")) {
        if (href.length > bestLen) {
          best = g;
          bestLen = href.length;
        }
      }
    }
  }
  return best;
}

/** Breadcrumb trail for TopBar: "Grup > Sayfa" */
export function crumbsForPath(pathname: string): Crumb[] {
  if (pathname === "/" || pathname === "/dashboard") {
    return [{ label: "Ana Sayfa" }, { label: "Genel Bakış" }];
  }
  const group = findGroupForPath(pathname);
  const exact = PATH_LABELS[pathname];
  const pageLabel =
    exact ||
    (() => {
      // dynamic segments e.g. /orders/12
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
        const parent = "/" + parts.slice(0, -1).join("/");
        return (PATH_LABELS[parent] || parts[0]) + " · Detay";
      }
      return parts[parts.length - 1] || pathname;
    })();

  if (!group || group.id === "home") {
    return [{ label: "Ana Sayfa", href: "/dashboard" }, { label: pageLabel }];
  }
  return [
    { label: group.label, href: group.href },
    { label: pageLabel },
  ];
}

export function titleForPath(pathname: string): string {
  if (pathname === "/" || pathname === "/dashboard") return "Ana Sayfa";
  const crumbs = crumbsForPath(pathname);
  return crumbs[crumbs.length - 1]?.label || "Baykuş Baskı";
}

/** Desktop Ana Sayfa quick actions */
export const QUICK_ACTIONS = [
  { id: "satis_belgeleri", label: "Satışlar", href: "/orders", color: "bg-teal-600 hover:bg-teal-700" },
  { id: "siparis_listesi", label: "Sipariş Listesi", href: "/orders", color: "bg-emerald-700 hover:bg-emerald-800" },
  { id: "atolye_paneli", label: "Atölye Paneli", href: "/production", color: "bg-orange-500 hover:bg-orange-600" },
  { id: "gider_takibi", label: "Gider Takibi", href: "/finance/expenses", color: "bg-red-600 hover:bg-red-700" },
  { id: "fiyat_listesi", label: "Fiyat Listesi", href: "/price-lists", color: "bg-pink-700 hover:bg-pink-800" },
  { id: "alis_hareketleri", label: "Alış Hareketleri", href: "/purchases", color: "bg-sky-500 hover:bg-sky-600" },
  { id: "satis_teklif_olustur", label: "Satış / Teklif Oluştur", href: "/sales/create", color: "bg-blue-800 hover:bg-blue-900" },
] as const;

/** @deprecated flat list kept for older imports */
export type NavItem = NavLeaf;
export const NAV_ITEMS: NavItem[] = NAV_FLAT;
