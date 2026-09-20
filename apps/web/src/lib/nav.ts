export type NavLeaf = {
  href: string;
  label: string;
  color?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: string;
  color?: string;
  /** Hub or primary link when the group header is clicked */
  href?: string;
  items: NavLeaf[];
  defaultOpen?: boolean;
  /** Masaüstü "tek" — sidebar tek satır; alt sayfalar hub düğmelerinden */
  tek?: boolean;
};

/**
 * Masaüstü Baykuş Baskı sol menü — menu_tanimlari + modul_items birebir.
 * Her yaprak çalışan bir sayfaya çözülür.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Ana Sayfa",
    icon: "🏠",
    color: "#93c5fd",
    href: "/dashboard",
    items: [],
  },
  {
    id: "customers",
    label: "Müşteri Merkezi",
    icon: "👥",
    color: "#6ee7b7",
    href: "/customers",
    tek: true,
    items: [
      { href: "/customers", label: "Müşteri Listesi" },
      { href: "/customers/new", label: "Yeni Müşteri" },
      { href: "/customers/track", label: "Müşteri Takibi" },
      { href: "/customers/receivables", label: "Açık Alacaklar" },
    ],
  },
  {
    id: "suppliers",
    label: "Tedarik Merkezi",
    icon: "🏭",
    color: "#a7f3d0",
    href: "/suppliers",
    tek: true,
    items: [
      { href: "/suppliers", label: "Tedarikçiler" },
      { href: "/purchases", label: "Alış Hareketleri" },
      { href: "/suppliers/payables", label: "Borç / Alacak" },
      { href: "/suppliers/payables?fis=1", label: "Borç-Alacak Fişi" },
      { href: "/suppliers/payables?pay=1", label: "Tedarikçi Ödemesi" },
      { href: "/purchases/new", label: "Satın Alma Talebi" },
    ],
  },
  {
    id: "products",
    label: "Ürün & Stok Merkezi",
    icon: "📦",
    color: "#38bdf8",
    href: "/products",
    tek: true,
    items: [
      { href: "/products", label: "Ürün Yönetimi" },
      { href: "/products?tab=variants", label: "Kartlar / Varyantlar" },
      { href: "/stock", label: "Stok Yönetimi" },
      { href: "/stock/critical", label: "Kritik Stok" },
      { href: "/reports/stock", label: "Stok Raporu" },
      { href: "/products/new", label: "Hızlı Varyant" },
      { href: "/stock/warehouses", label: "Depolar" },
      { href: "/stock/count", label: "Stok Sayımı" },
      { href: "/tools/import", label: "Excel İçe Aktar" },
      { href: "/products/labels", label: "Barkod / Etiket" },
    ],
  },
  {
    id: "sales",
    label: "Satış / Sipariş",
    icon: "🛒",
    color: "#fbbf24",
    href: "/sales",
    defaultOpen: true,
    items: [
      { href: "/orders", label: "Sipariş Merkezi", color: "#111827" },
      { href: "/sales", label: "Satışlar", color: "#1f6feb" },
      { href: "/sales/create", label: "Satış / Teklif Oluştur", color: "#1f6feb" },
      { href: "/sales/retail", label: "Perakende Satışlar", color: "#f97316" },
      { href: "/quotes", label: "Teklifler", color: "#6d28d9" },
      { href: "/orders", label: "Sipariş Listesi", color: "#0f766e" },
      { href: "/orders?status=Teslim%20Edildi", label: "Teslim Edilen Siparişler", color: "#198754" },
      { href: "/orders/delivery", label: "Teslim Takibi", color: "#198754" },
      { href: "/orders/weekly-plan", label: "Haftalık Plan", color: "#f59e0b" },
      { href: "/orders/kanban", label: "Sipariş Yaşam Çizgisi", color: "#334155" },
    ],
  },
  {
    id: "production",
    label: "Üretim / Atölye",
    icon: "🔧",
    color: "#f97316",
    href: "/production",
    items: [
      { href: "/production", label: "Üretim Akış Paneli", color: "#f59e0b" },
      { href: "/production/work-orders", label: "İş Emirleri", color: "#1f6feb" },
      { href: "/production/sublimation", label: "Sublimasyon Baskı Süreleri", color: "#0d9488" },
      { href: "/orders/delivery-alarm", label: "Teslim Alarmı", color: "#be123c" },
      { href: "/orders/overdue", label: "Geciken İşler", color: "#dc2626" },
    ],
  },
  {
    id: "ecommerce",
    label: "E-Ticaret",
    icon: "🌐",
    color: "#c084fc",
    href: "/ecommerce",
    items: [
      { href: "/ecommerce", label: "İnternet Satışları", color: "#0f766e" },
    ],
  },
  {
    id: "finance",
    label: "Finans",
    icon: "💰",
    color: "#facc15",
    href: "/finance",
    items: [
      { href: "/finance/cash", label: "Günlük Kasa", color: "#198754" },
      { href: "/finance/open-balances", label: "Açık Bakiyeler", color: "#be123c" },
      { href: "/finance/banks", label: "Hesaplarım", color: "#0f766e" },
      { href: "/finance/loans", label: "Krediler", color: "#7c3aed" },
      { href: "/finance/expenses", label: "Masraflar", color: "#be123c" },
      { href: "/finance/assets", label: "Demirbaşlar", color: "#d39e00" },
    ],
  },
  {
    id: "pricing",
    label: "Fiyat / Maliyet",
    icon: "🏷️",
    color: "#fb7185",
    href: "/price-lists",
    items: [
      { href: "/price-lists", label: "Fiyat Listesi", color: "#be123c" },
      { href: "/tools/dtf", label: "DTF Maliyet Hesaplama", color: "#0d9488" },
      { href: "/tools/costs", label: "Maliyet Yönetimi", color: "#c2410c" },
      { href: "/tools/last-purchase-prices", label: "Son Alış Fiyatları", color: "#6f42c1" },
    ],
  },
  {
    id: "reports",
    label: "Raporlar",
    icon: "📈",
    color: "#60a5fa",
    href: "/reports",
    items: [
      { href: "/reports/archive", label: "Belge Arşiv Merkezi", color: "#111827" },
      { href: "/reports/profit", label: "Kâr Analizi", color: "#ea580c" },
      { href: "/reports/expenses", label: "Masraflar", color: "#be123c" },
      { href: "/reports/cari-statements", label: "Cari Dökümler", color: "#0f766e" },
      { href: "/reports/sales", label: "Satış Raporu", color: "#1f6feb" },
      { href: "/reports/purchases", label: "Alış Raporu", color: "#198754" },
    ],
  },
  {
    id: "comms",
    label: "Müşteri İletişim",
    icon: "💬",
    color: "#2dd4bf",
    href: "/communication",
    items: [
      { href: "/communication", label: "İletişim Merkezi", color: "#0f766e" },
      { href: "/whatsapp/track", label: "WhatsApp Takip", color: "#15803d" },
      { href: "/crm/special-days", label: "Özel Gün / Kampanya", color: "#f59e0b" },
      { href: "/whatsapp", label: "WhatsApp Taslakları", color: "#16a34a" },
      { href: "/whatsapp?tab=history", label: "WhatsApp Geçmişi", color: "#64748b" },
      { href: "/directory", label: "Fihrist", color: "#0f766e" },
    ],
  },
  {
    id: "documents",
    label: "Evrak Dolabı",
    icon: "📁",
    color: "#fcd34d",
    href: "/documents",
    tek: true,
    items: [{ href: "/documents", label: "Evrak Dolabı" }],
  },
  {
    id: "system",
    label: "Sistem",
    icon: "⚙️",
    color: "#cbd5e1",
    href: "/settings",
    items: [
      { href: "/settings", label: "Ayarlar", color: "#6f42c1" },
      { href: "/settings/lock-mode", label: "Yetki / Kilit Modu", color: "#111827" },
      { href: "/settings", label: "Kullanıcı Yönetimi", color: "#0f766e" },
      { href: "/settings/audit", label: "İşlem Geçmişi", color: "#334155" },
      { href: "/tasks", label: "Görev / Hatırlatma", color: "#2563eb" },
      { href: "/settings/backups", label: "Yedekleme", color: "#0f766e" },
      { href: "/settings/backups?tab=test", label: "Yedek Test Et", color: "#f59e0b" },
      { href: "/settings/health", label: "Sistem Sağlık Merkezi", color: "#be123c" },
      { href: "/settings/database", label: "Merkezi DB / VPS", color: "#7c3aed" },
      { href: "/settings?action=switch-user", label: "Kullanıcı Değiştir", color: "#0f766e" },
    ],
  },
];

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
  "/sales": "Direkt Satışlar",
  "/sales/create": "Satış / Teklif Oluştur",
  "/sales/retail": "Perakende Satışlar",
  "/sales/retail/new": "Perakende Satış",
  "/production": "Üretim Akış Paneli",
  "/production/work-orders": "İş Emirleri",
  "/production/sublimation": "Sublimasyon Baskı Süreleri",
  "/orders/delivery-alarm": "Teslim Alarmı",
  "/orders/overdue": "Geciken İşler",
  "/ecommerce": "İnternet Satışları",
  "/documents": "Evrak Dolabı",
  "/customers": "Müşteri Merkezi",
  "/customers/new": "Yeni Müşteri",
  "/customers/receivables": "Açık Alacaklar",
  "/customers/track": "Müşteri Takibi",
  "/directory": "Fihrist",
  "/products": "Ürün & Stok Merkezi",
  "/products/new": "Yeni Ürün",
  "/products/labels": "Barkod / Etiket",
  "/stock": "Stok Yönetimi",
  "/stock/critical": "Kritik Stok",
  "/stock/warehouses": "Depolar",
  "/orders": "Sipariş Merkezi",
  "/orders/new": "Yeni Sipariş",
  "/orders/kanban": "Sipariş Yaşam Çizgisi",
  "/orders/delivery": "Teslim Takibi",
  "/orders/weekly-plan": "Haftalık Plan",
  "/quotes": "Teklifler",
  "/quotes/new": "Yeni Teklif",
  "/suppliers": "Tedarik Merkezi",
  "/suppliers/payables": "Borç / Alacak",
  "/purchases": "Alış Hareketleri",
  "/purchases/new": "Satın Alma Talebi",
  "/payables": "Borçlar",
  "/finance": "Finans",
  "/finance/cash": "Günlük Kasa",
  "/finance/banks": "Hesaplarım",
  "/finance/expenses": "Masraflar",
  "/finance/loans": "Krediler",
  "/finance/assets": "Demirbaşlar",
  "/finance/open-balances": "Açık Bakiyeler",
  "/price-lists": "Fiyat Listesi",
  "/tools/dtf": "DTF Maliyet Hesaplama",
  "/tools/costs": "Maliyet Yönetimi",
  "/tools/last-purchase-prices": "Son Alış Fiyatları",
  "/reports": "Raporlar",
  "/reports/sales": "Satış Raporu",
  "/reports/stock": "Stok Raporu",
  "/reports/finance": "Finans Raporu",
  "/reports/receivables": "Alacaklar",
  "/reports/payables": "Borçlar",
  "/reports/profit": "Kâr Analizi",
  "/reports/expenses": "Masraf Raporları",
  "/reports/purchases": "Alış Raporu",
  "/reports/cari-statements": "Cari Dökümler",
  "/reports/archive": "Belge Arşiv Merkezi",
  "/communication": "İletişim Merkezi",
  "/whatsapp": "WhatsApp Taslakları",
  "/whatsapp/track": "WhatsApp Takip",
  "/crm/special-days": "Özel Gün / Kampanya",
  "/crm/campaigns": "Kampanyalar",
  "/settings": "Ayarlar",
  "/settings/integrations": "Entegrasyonlar",
  "/tasks": "Görevler",
  "/stock/count": "Stok Sayımı",
  "/tools/import": "Excel İçe Aktarma",
  "/settings/backups": "Yedekleme",
  "/settings/audit": "İşlem Geçmişi",
  "/settings/health": "Sistem Sağlık Merkezi",
  "/settings/lock-mode": "Yetki / Kilit Modu",
  "/settings/database": "Merkezi DB / VPS",
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

export function crumbsForPath(pathname: string): Crumb[] {
  if (pathname === "/" || pathname === "/dashboard") {
    return [{ label: "Ana Sayfa" }, { label: "Genel Bakış" }];
  }
  // Masaüstü: Satışlar › Direkt Satışlar › Perakende Satış
  if (pathname === "/sales" || pathname.startsWith("/sales?")) {
    return [
      { label: "Satışlar", href: "/sales" },
      { label: "Direkt Satışlar" },
    ];
  }
  if (pathname === "/sales/retail/new") {
    return [
      { label: "Satışlar", href: "/sales" },
      { label: "Direkt Satışlar", href: "/sales" },
      { label: "Perakende Satış" },
    ];
  }
  if (pathname === "/sales/retail" || pathname.startsWith("/sales/retail?")) {
    return [
      { label: "Satış / Sipariş", href: "/sales" },
      { label: "Satışlar", href: "/sales" },
      { label: "Perakende Satışlar" },
    ];
  }
  const group = findGroupForPath(pathname);
  const exact = PATH_LABELS[pathname];
  const pageLabel =
    exact ||
    (() => {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1]!)) {
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
  if (pathname === "/sales" || pathname.startsWith("/sales?")) return "Direkt Satışlar";
  if (pathname === "/sales/retail/new") return "Perakende Satış Gir";
  const crumbs = crumbsForPath(pathname);
  return crumbs[crumbs.length - 1]?.label || "Baykuş Baskı";
}

/** Full desktop hizli_islem_katalogu keys → web routes */
export const QUICK_ACTION_CATALOG: {
  id: string;
  label: string;
  href: string;
  hex: string;
  description?: string;
  fixed?: boolean;
}[] = [
  { id: "satis_teklif_olustur", label: "Satış / Teklif Oluştur", href: "/sales/create", hex: "#1f6feb", description: "Yeni satış veya teklif kaydı oluşturun." },
  { id: "teklif_listesi", label: "Teklifler", href: "/quotes", hex: "#7c3aed", description: "Hazırlanan teklifleri görüntüleyin." },
  { id: "siparis_listesi", label: "Sipariş Listesi", href: "/orders", hex: "#0f766e", description: "Sipariş durumlarını ve teslimleri takip edin." },
  { id: "akis_paneli", label: "Sipariş Merkezi", href: "/orders", hex: "#111827", description: "Sipariş sürecini tek ekrandan yönetin." },
  { id: "atolye_paneli", label: "Üretim Akış Paneli", href: "/production", hex: "#f59e0b", description: "Üretimdeki işleri ve aşamaları izleyin." },
  { id: "is_emirleri", label: "İş Emirleri", href: "/production/work-orders", hex: "#2563eb", description: "İş emirlerine hızlı erişim sağlayın." },
  { id: "musteri_merkezi", label: "Müşteri Merkezi", href: "/customers", hex: "#198754", description: "Müşteri ve cari işlemlerini yönetin." },
  { id: "musteri_iletisim", label: "Müşteri İletişim", href: "/communication", hex: "#0f766e", description: "Kampanya, WhatsApp ve fihrist araçlarını açın." },
  { id: "alis_hareketleri", label: "Alış Hareketleri", href: "/purchases", hex: "#198754", description: "Alış hareketlerini yönetin.", fixed: true },
  { id: "tedarik_merkezi", label: "Tedarik Merkezi", href: "/suppliers", hex: "#0f766e", description: "Tedarikçi ve satın alma işlemlerine ulaşın." },
  { id: "satis_belgeleri", label: "Satışlar", href: "/sales", hex: "#0f766e", description: "Direkt satış belgelerini görüntüleyin." },
  { id: "perakende_satislar", label: "Perakende Satışlar", href: "/sales/retail", hex: "#f97316", description: "Perakende satış listesi." },
  { id: "gider_takibi", label: "Gider Takibi", href: "/finance/expenses", hex: "#be123c", description: "Masraf kayıtlarını ve ödemeleri takip edin." },
  { id: "acik_bakiyeler", label: "Açık Bakiyeler", href: "/customers/receivables", hex: "#be123c", description: "Açık cari alacaklar." },
  { id: "hesaplarim", label: "Hesaplarım", href: "/finance/banks", hex: "#334155", description: "Banka hesapları." },
  { id: "krediler", label: "Krediler", href: "/finance/loans", hex: "#7c3aed", description: "Kredi ödemeleri." },
  { id: "urun_stok_merkezi", label: "Ürün & Stok Merkezi", href: "/products", hex: "#06b6d4", description: "Ürün, varyant ve stok durumunu yönetin." },
  { id: "fiyat_listesi", label: "Fiyat Listesi", href: "/price-lists", hex: "#be123c", description: "Fiyat listeleri." },
  { id: "dtf_maliyet", label: "DTF Maliyet", href: "/tools/dtf", hex: "#0891b2", description: "DTF maliyet hesaplama." },
  { id: "maliyet_yonetimi", label: "Maliyet Yönetimi", href: "/tools/costs", hex: "#7c3aed", description: "Maliyet kalemleri." },
  { id: "internet_raporu", label: "İnternet Raporu", href: "/ecommerce", hex: "#f97316", description: "İnternet satışları." },
  { id: "gorevler", label: "Görevler", href: "/tasks", hex: "#2563eb", description: "Görev / hatırlatma." },
  { id: "evrak_dolabi", label: "Evrak Dolabı", href: "/documents", hex: "#0f766e", description: "Belgelerinize merkezi alandan erişin." },
  { id: "yedekleme", label: "Yedekleme", href: "/settings/backups", hex: "#16a34a", description: "Yedekleme paneli." },
  { id: "ayarlar", label: "Ayarlar", href: "/settings", hex: "#6f42c1", description: "Sistem ayarları." },
];

/** Default dashboard strip (until settings loaded) */
export const QUICK_ACTIONS = QUICK_ACTION_CATALOG.filter((a) =>
  [
    "satis_belgeleri",
    "siparis_listesi",
    "atolye_paneli",
    "gider_takibi",
    "fiyat_listesi",
    "alis_hareketleri",
    "satis_teklif_olustur",
  ].includes(a.id),
);

export const DEFAULT_SOL_MENU_ORDER = NAV_GROUPS.map((g) => g.label);


/** Masaüstü yetki_menuleri — kilit moduna göre sol menü grupları. */
export const LOCK_MODE_ALLOWED: Record<string, string[]> = {
  Yönetici: [
    "Ana Sayfa", "Müşteri Merkezi", "Müşteri İletişim", "Satış / Sipariş", "Üretim / Atölye",
    "Ürün & Stok Merkezi", "Tedarik Merkezi", "E-Ticaret", "Finans", "Fiyat / Maliyet",
    "Raporlar", "Evrak Dolabı", "Sistem",
  ],
  Personel: [
    "Ana Sayfa", "Müşteri Merkezi", "Müşteri İletişim", "Satış / Sipariş", "Üretim / Atölye",
    "Ürün & Stok Merkezi", "E-Ticaret", "Evrak Dolabı",
  ],
  "Tam Yetki": [
    "Ana Sayfa", "Müşteri Merkezi", "Müşteri İletişim", "Satış / Sipariş", "Üretim / Atölye",
    "Ürün & Stok Merkezi", "Tedarik Merkezi", "E-Ticaret", "Finans", "Fiyat / Maliyet",
    "Raporlar", "Evrak Dolabı", "Sistem",
  ],
  "Sadece Satış": [
    "Ana Sayfa", "Müşteri Merkezi", "Müşteri İletişim", "Satış / Sipariş", "E-Ticaret",
    "Fiyat / Maliyet", "Evrak Dolabı", "Sistem",
  ],
  "Sadece Stok": [
    "Ana Sayfa", "Ürün & Stok Merkezi", "Tedarik Merkezi", "Fiyat / Maliyet", "Evrak Dolabı", "Sistem",
  ],
};

/** Canonical label = original NAV_GROUPS.label (before sol_menu_adlari rename). */
export function filterNavByLockMode(
  groups: NavGroup[],
  userMode: string | undefined | null,
  originalLabels?: Record<string, string>,
): NavGroup[] {
  const mode = userMode || "Yönetici";
  const allowed = new Set(LOCK_MODE_ALLOWED[mode] || LOCK_MODE_ALLOWED["Yönetici"]);
  // Map display label back to canonical if renamed
  return groups.filter((g) => {
    const canonical = NAV_GROUPS.find((n) => n.id === g.id)?.label || g.label;
    void originalLabels; // reserved for future rename reverse-lookup
    return allowed.has(canonical);
  });
}

export function orderNavGroups(
  groups: NavGroup[],
  order: string[] | undefined,
  labels: Record<string, string> | undefined,
): NavGroup[] {
  const byLabel = new Map(groups.map((g) => [g.label, g]));
  const used = new Set<string>();
  const out: NavGroup[] = [];
  for (const name of order || DEFAULT_SOL_MENU_ORDER) {
    const g = byLabel.get(name);
    if (!g || used.has(g.id)) continue;
    used.add(g.id);
    const display = labels?.[name]?.trim();
    out.push(display ? { ...g, label: display } : g);
  }
  for (const g of groups) {
    if (!used.has(g.id)) {
      const display = labels?.[g.label]?.trim();
      out.push(display ? { ...g, label: display } : g);
    }
  }
  return out;
}

/** @deprecated */
export type NavItem = NavLeaf;
export const NAV_ITEMS: NavItem[] = NAV_FLAT;
