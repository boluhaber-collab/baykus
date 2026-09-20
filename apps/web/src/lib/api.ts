const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getApiBase(): string {
  return API_URL;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("baykus_token");
}

export function setToken(token: string) {
  localStorage.setItem("baykus_token", token);
}

export function clearToken() {
  localStorage.removeItem("baykus_token");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Yetkisiz");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    let message = data.message || `Hata: ${res.status}`;
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail)) {
      message = detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ");
    }
    throw new Error(message);
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Giriş başarısız");
  setToken(data.access_token);
  return data.access_token;
}

export type Customer = {
  id: number;
  code?: string | null;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  tax_number?: string | null;
  tax_office?: string | null;
  notes?: string | null;
  is_active?: boolean;
  special_day_note?: string | null;
  special_day_date?: string | null;
  opening_balance?: number;
  balance?: number;
  created_at: string;
  updated_at: string;
};

export type CariMovement = {
  id: number;
  customer_id: number;
  movement_type: "sale" | "payment" | "adjustment" | "deposit" | string;
  debit: number;
  credit: number;
  movement_date: string;
  order_id?: number | null;
  order_number?: string | null;
  note?: string | null;
  created_at: string;
  running_balance?: number | null;
};

export type CustomerStatement = {
  customer_id: number;
  customer_name: string;
  opening_balance: number;
  closing_balance: number;
  movements: CariMovement[];
};

export type ReceivableItem = {
  customer_id: number;
  code?: string | null;
  name: string;
  company?: string | null;
  phone?: string | null;
  city?: string | null;
  balance: number;
  last_movement_date?: string | null;
};

export type CustomerOrderBrief = {
  id: number;
  order_number: string;
  status: string;
  total_amount: number;
  remaining_amount: number;
  due_date?: string | null;
  created_at: string;
};

export type CustomerQuoteBrief = {
  id: number;
  quote_number: string;
  status: string;
  total_amount: number;
  valid_until?: string | null;
  created_at: string;
};

export type CustomerDetail = Customer & {
  recent_orders: CustomerOrderBrief[];
  recent_quotes?: CustomerQuoteBrief[];
  recent_movements: CariMovement[];
  timeline: {
    kind: string;
    date?: string | null;
    label: string;
    status?: string;
    amount?: number;
    debit?: number;
    credit?: number;
    note?: string | null;
    ref_id?: number;
  }[];
};

export const CARI_TYPE_LABELS: Record<string, string> = {
  sale: "Satış",
  payment: "Ödeme",
  adjustment: "Düzeltme",
  deposit: "Kapora / Depozito",
};

export type KPIStats = {
  customers: number;
  products: number;
  open_orders: number;
  revenue_month: number;
  pending_quotes: number;
};

export type DashboardStatusCount = {
  status: string;
  count: number;
};

export type DashboardLowStock = {
  product_id: number;
  sku: string;
  name: string;
  stock_qty: number;
  threshold: number;
  variant_id?: number | null;
};

export type DashboardRecentOrder = {
  id: number;
  order_number: string;
  customer_name?: string | null;
  status: string;
  total_amount: number;
  remaining_amount: number;
  created_at: string;
};

export type DashboardCariPayment = {
  id: number;
  customer_id: number;
  customer_name?: string | null;
  credit: number;
  movement_date: string;
  note?: string | null;
  order_number?: string | null;
};

export type DashboardFinanceMovement = {
  source: "cash" | "bank" | string;
  id: number;
  movement_type: string;
  amount: number;
  direction: string;
  movement_date: string;
  account_name?: string | null;
  note?: string | null;
};

export type UpcomingSpecialDay = {
  id: number;
  name: string;
  event_date: string;
  day_type: string;
  customer_id?: number | null;
  customer_name?: string | null;
  days_until: number;
  note?: string | null;
};

export type LoanDueBrief = {
  installment_id: number;
  loan_id: number;
  loan_title: string;
  due_date: string;
  amount: number;
  days_until: number;
};

export type DashboardSummary = {
  orders_today_count: number;
  orders_today_revenue: number;
  orders_month_count: number;
  orders_month_revenue: number;
  open_orders: number;
  status_counts: DashboardStatusCount[];
  collections_today?: number;
  internet_sales_today_revenue?: number;
  internet_sales_today_count?: number;
  month_net_profit?: number;
  month_label?: string;
  critical_stock_count: number;
  low_stock_items: DashboardLowStock[];
  stock_value?: number;
  variants_count?: number;
  stock_qty_total?: number;
  due_today_count?: number;
  due_soon_count?: number;
  overdue_deliveries_count?: number;
  open_workshop_jobs?: number;
  loan_due_count?: number;
  loan_due_items?: LoanDueBrief[];
  customer_count: number;
  receivables_total: number;
  receivables_customer_count: number;
  payables_total?: number;
  top_selling_product?: string | null;
  cash_balance: number;
  bank_balance: number;
  total_liquidity: number;
  recent_orders: DashboardRecentOrder[];
  recent_cari_payments: DashboardCariPayment[];
  recent_finance_movements: DashboardFinanceMovement[];
  products_count: number;
  upcoming_special_days?: UpcomingSpecialDay[];
};

export const ORDER_STATUSES = [
  "Sipariş Alındı",
  "Hazırlanıyor",
  "Baskıda",
  "Hazır",
  "Teslim Edildi",
  "Sipariş İptali",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderLine = {
  id?: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  print_type?: string | null;
  unit_price: number;
  discount_rate?: number;
  discount_amount?: number;
  line_total?: number;
};

export type OrderListItem = {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  status: string;
  total_amount: number;
  deposit_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date?: string | null;
  delivery_date?: string | null;
  channel?: string | null;
  design_status?: string | null;
  design_notes?: string | null;
  design_approved_at?: string | null;
  design_whatsapp_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderDetail = OrderListItem & {
  discount_amount: number;
  lines: OrderLine[];
  payments: {
    id: number;
    amount: number;
    method: string;
    status: string;
    paid_at: string;
    notes?: string | null;
  }[];
  status_history: {
    id: number;
    from_status: string | null;
    to_status: string;
    note?: string | null;
    changed_by_user_id?: number | null;
    created_at: string;
  }[];
};

export type KanbanBoard = {
  columns: {
    key: string;
    label: string;
    items: {
      id: number;
      order_number: string;
      customer_name?: string | null;
      status: string;
      total_amount: number;
      remaining_amount: number;
      due_date?: string | null;
      channel?: string | null;
      design_status?: string | null;
    }[];
  }[];
};

export type ProductVariant = {
  id: number;
  product_id: number;
  name: string;
  sku: string;
  color?: string | null;
  size?: string | null;
  print_type?: string | null;
  barcode?: string | null;
  price: number;
  stock_qty: number;
  is_critical?: boolean;
};

export type StockMovement = {
  id: number;
  product_id: number;
  variant_id?: number | null;
  direction: "increase" | "decrease" | string;
  quantity: number;
  qty_before: number;
  qty_after: number;
  reason?: string | null;
  note?: string | null;
  warehouse?: string | null;
  created_by_user_id?: number | null;
  created_at: string;
  variant_sku?: string | null;
  variant_name?: string | null;
};

/** List row / OrderForm-compatible product */
export type Product = {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  product_type?: string;
  base_price: number;
  purchase_price?: number;
  cost?: number;
  stock_qty: number;
  total_stock?: number;
  critical_stock_threshold?: number;
  is_critical?: boolean;
  is_active?: boolean;
  warehouse?: string | null;
  variants_count?: number;
  photo_url?: string | null;
};


export type ProductPricingInfo = {
  product_id: number;
  variant_id?: number | null;
  name: string;
  sku: string;
  unit_price: number;
  price_source: "price_list" | "product" | "variant" | string;
  price_list_id?: number | null;
  price_list_name?: string | null;
  stock_qty: number;
  critical_stock_threshold: number;
  is_critical: boolean;
};

export type ProductPriceListRef = {
  price_list_id: number;
  price_list_name: string;
  unit_price: number;
  is_active: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
};

export type ProductDetail = Product & {
  supplier_name?: string | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
  variants: ProductVariant[];
  recent_movements: StockMovement[];
};

export type CriticalStockItem = {
  product_id: number;
  product_sku: string;
  product_name: string;
  category?: string | null;
  variant_id?: number | null;
  variant_sku?: string | null;
  variant_name?: string | null;
  stock_qty: number;
  critical_stock_threshold: number;
  warehouse?: string | null;
};

export function stockBadgeClass(qty: number, threshold: number, isCritical?: boolean): string {
  if (isCritical || qty < threshold) return "bg-red-100 text-red-800";
  if (qty < threshold * 2) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);
}

/** Desktop SIPARIS_DURUM_RENKLERI badge backgrounds */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  "Sipariş Alındı": "#e0f2fe",
  "Hazırlanıyor": "#fef3c7",
  "Baskıda": "#ddd6fe",
  "Hazır": "#dcfce7",
  "Teslim Edildi": "#e5e7eb",
  "Sipariş İptali": "#fee2e2",
};

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "Sipariş Alındı":
      return "bg-[#e0f2fe] text-sky-900";
    case "Hazırlanıyor":
      return "bg-[#fef3c7] text-amber-900";
    case "Baskıda":
      return "bg-[#ddd6fe] text-violet-900";
    case "Hazır":
      return "bg-[#dcfce7] text-emerald-900";
    case "Teslim Edildi":
      return "bg-[#e5e7eb] text-slate-800";
    case "Sipariş İptali":
      return "bg-[#fee2e2] text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}


// ─── Finance (Kasa / Banka) ───────────────────────────────────────────────

export type CashRegister = {
  id: number;
  name: string;
  opening_balance: number;
  currency: string;
  is_active: boolean;
  balance: number;
  created_at: string;
};

export type BankAccount = {
  id: number;
  name: string;
  account_type?: string;
  institution?: string | null;
  iban?: string | null;
  currency: string;
  opening_balance: number;
  is_active: boolean;
  notes?: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
};

export const BANK_ACCOUNT_TYPES = ["Banka", "POS", "Kredi Kartı", "Şirket Ortağı"] as const;

export type CashDailyPanel = {
  from_date: string;
  to_date: string;
  cash_register: CashRegister | null;
  summary: {
    order_count: number;
    revenue: number;
    collections: number;
    remaining: number;
    cost: number;
    gross_profit: number;
    expense: number;
    net_profit: number;
    quote_count: number;
    delivered_count: number;
    top_product: string;
    top_category: string;
  };
  orders: {
    id: number;
    order_number: string;
    document_type: string;
    date: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    products: string;
    qty: number;
    total_amount: number;
    deposit_amount: number;
    remaining_amount: number;
    cost?: number;
    profit?: number | null;
    status: string;
    href: string;
  }[];
  movements: {
    date: string;
    source: string;
    account: string;
    movement_type: string;
    note: string | null;
    in_amount: number;
    out_amount: number;
    payment_type: string;
  }[];
};

export type OpenBalanceOrder = {
  order_id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  order_date: string | null;
  due_date: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  open_balance: number;
  products: string;
  row_tag: string;
  href: string;
};

export type CashMovement = {
  id: number;
  cash_register_id: number;
  movement_type: string;
  amount: number;
  movement_date: string;
  category?: string | null;
  note?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  bank_account_id?: number | null;
  bank_account_name?: string | null;
  transfer_group_id?: string | null;
  running_balance?: number | null;
  direction: "in" | "out" | string;
  created_at: string;
};

export type BankMovement = {
  id: number;
  bank_account_id: number;
  bank_account_name?: string | null;
  movement_type: string;
  amount: number;
  movement_date: string;
  category?: string | null;
  note?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  cash_register_id?: number | null;
  counterpart_bank_account_id?: number | null;
  transfer_group_id?: string | null;
  running_balance?: number | null;
  direction: "in" | "out" | string;
  created_at: string;
};

export type FinanceRecentMovement = {
  source: "cash" | "bank" | string;
  id: number;
  movement_type: string;
  amount: number;
  movement_date: string;
  note?: string | null;
  account_name?: string | null;
  direction: string;
  created_at: string;
};

export type FinanceSummary = {
  total_cash: number;
  total_bank: number;
  total_liquidity: number;
  cash_registers: CashRegister[];
  bank_accounts: BankAccount[];
  today_cash_in: number;
  today_cash_out: number;
  today_bank_in: number;
  today_bank_out: number;
  today_movements_count: number;
  recent_movements: FinanceRecentMovement[];
  receivables?: number | null;
};

export const CASH_TYPE_LABELS: Record<string, string> = {
  tahsilat: "Tahsilat",
  odeme: "Ödeme",
  gider: "Gider",
  transfer_in: "Transfer giriş",
  transfer_out: "Transfer çıkış",
};

export const BANK_TYPE_LABELS: Record<string, string> = {
  deposit: "Yatırma / Havale giriş",
  withdrawal: "Çekim",
  transfer_in: "Transfer giriş",
  transfer_out: "Transfer çıkış",
  fee: "Masraf",
};

export type Supplier = {
  id: number;
  code?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  tax_number?: string | null;
  tax_office?: string | null;
  notes?: string | null;
  is_active?: boolean;
  opening_balance?: number;
  balance?: number;
  created_at: string;
  updated_at: string;
};

export type SupplierMovement = {
  id: number;
  supplier_id: number;
  movement_type: "purchase" | "payment" | "adjustment" | string;
  debit: number;
  credit: number;
  movement_date: string;
  purchase_id?: number | null;
  purchase_number?: string | null;
  note?: string | null;
  created_at: string;
  running_balance?: number | null;
};

export type SupplierStatement = {
  supplier_id: number;
  supplier_name: string;
  opening_balance: number;
  closing_balance: number;
  movements: SupplierMovement[];
};

export type PayableItem = {
  supplier_id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
  city?: string | null;
  balance: number;
  last_movement_date?: string | null;
};

export type SupplierPurchaseBrief = {
  id: number;
  purchase_number: string;
  status: string;
  total_amount: number;
  purchase_date: string;
  created_at: string;
};

export type SupplierDetail = Supplier & {
  recent_purchases: SupplierPurchaseBrief[];
  recent_movements: SupplierMovement[];
};

export const SUPPLIER_MOVEMENT_LABELS: Record<string, string> = {
  purchase: "Satın Alma",
  payment: "Ödeme",
  adjustment: "Düzeltme",
};

export type PurchaseLine = {
  id: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  product_name?: string | null;
  variant_name?: string | null;
};

export type PurchaseListItem = {
  id: number;
  purchase_number: string;
  supplier_id: number;
  supplier_name: string;
  purchase_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string | null;
  created_at: string;
};

export type PurchaseDetail = PurchaseListItem & {
  lines: PurchaseLine[];
  confirmed_at?: string | null;
  updated_at: string;
};

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  confirmed: "Onaylı",
  cancelled: "İptal",
};


// ─── Reports ──────────────────────────────────────────────────────────────

export type ReportCatalogItem = {
  key: string;
  title: string;
  path: string;
  href: string;
  description: string;
};

export type ReportResponse<TRow = Record<string, unknown>> = {
  summary: Record<string, unknown>;
  rows: TRow[];
  orders?: TRow[];
  purchases?: TRow[];
};

/** Download CSV from a report endpoint (format=csv). */
export async function downloadReportCsv(path: string, filename: string): Promise<void> {
  const token = getToken();
  const url = path.includes("?")
    ? `${API_URL}${path}&format=csv`
    : `${API_URL}${path}?format=csv`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Yetkisiz");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.message || `CSV hatası: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}


export const ORDER_CHANNELS = ["mağaza", "perakende", "internet", "Trendyol", "Hepsiburada", "N11", "diğer"] as const;
export const DESIGN_STATUSES = [
  "Bekliyor",
  "Onay İstendi",
  "Onaylandı",
  "Revizyon İstendi",
  "Revize Edildi",
  "İptal",
] as const;

export const QUOTE_STATUSES = [
  "Taslak",
  "Gönderildi",
  "Onaylandı",
  "Reddedildi",
  "Siparişe Dönüştü",
] as const;

export type QuoteLine = {
  id?: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  print_type?: string | null;
  unit_price: number;
  discount_rate?: number;
  discount_amount?: number;
  line_total?: number;
};

export type QuoteListItem = {
  id: number;
  quote_number: string;
  customer_id: number | null;
  customer_name?: string | null;
  status: string;
  total_amount: number;
  discount_amount: number;
  valid_until?: string | null;
  notes?: string | null;
  converted_order_id?: number | null;
  is_cancelled?: boolean;
  created_at: string;
  updated_at: string;
};

export type QuoteDetail = QuoteListItem & { lines: QuoteLine[] };

export type WhatsAppTemplate = {
  id: number;
  name: string;
  category: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type WhatsAppLog = {
  id: number;
  template_id: number | null;
  template_name?: string | null;
  phone: string;
  rendered_body: string;
  wa_link: string;
  customer_name?: string | null;
  created_by_user_id?: number | null;
  created_at: string;
};

export type AppSettings = {
  company_name: string;
  phone: string;
  whatsapp?: string;
  web_adresi?: string;
  pdf_alt_baslik?: string;
  logo_dosyasi?: string;
  form_logo_dosyasi?: string;
  theme_label: string;
  require_login?: string;
  user_mode?: string;
  veri_motoru?: string;
  postgres_host?: string;
  postgres_port?: string;
  postgres_db?: string;
  postgres_user?: string;
  postgres_ssl?: string;
  hizli_islemler?: string[];
  sol_menu_sirasi?: string[];
  sol_menu_adlari?: Record<string, string>;
  teklif_sablon_adi?: string;
  teklif_sablon_baslik?: string;
  teklif_sablon_alt_baslik?: string;
  teklif_sablon_logo_goster?: string;
  teklif_sablon_musteri_goster?: string;
  teklif_sablon_urun_detay_goster?: string;
  teklif_sablon_toplam_goster?: string;
  teklif_sablon_not_goster?: string;
  teklif_sablon_sartlar_goster?: string;
  teklif_sablon_sartlar?: string;
  teklif_sablon_kapanis?: string;
};

export type VariantOption = {
  id: number;
  kind: string;
  value: string;
  note?: string | null;
};

export type QuickActionCatalogItem = {
  key: string;
  label: string;
  href: string;
  color: string;
  description?: string;
  fixed?: boolean;
};

export type DashboardNote = { id: string; text: string; at: string };

export type ExpenseCategory = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
};

export type Expense = {
  id: number;
  category_id: number;
  category_name?: string | null;
  amount: number;
  expense_date: string;
  due_date?: string | null;
  document_no?: string | null;
  payment_method: string;
  note?: string | null;
  cash_register_id?: number | null;
  bank_account_id?: number | null;
  is_posted: boolean;
  status_label?: string | null;
  created_by_user_id?: number | null;
  created_at: string;
};

/** Desktop TEKLIF_DURUM_RENKLERI (+ web status aliases) */
export const QUOTE_STATUS_COLORS: Record<string, string> = {
  Açık: "#f5f3ff",
  Taslak: "#f5f3ff",
  Gönderildi: "#e0f2fe",
  Onaylandı: "#dcfce7",
  Reddedildi: "#fee2e2",
  "Süresi Geçti": "#ffedd5",
  İptal: "#fee2e2",
  "Siparişe Dönüştü": "#ddd6fe",
};

export function quoteStatusBadgeClass(status: string): string {
  switch (status) {
    case "Açık":
    case "Taslak":
      return "bg-[#f5f3ff] text-violet-900";
    case "Gönderildi":
      return "bg-[#e0f2fe] text-sky-900";
    case "Onaylandı":
      return "bg-[#dcfce7] text-emerald-900";
    case "Reddedildi":
    case "İptal":
      return "bg-[#fee2e2] text-red-800";
    case "Süresi Geçti":
      return "bg-[#ffedd5] text-orange-900";
    case "Siparişe Dönüştü":
      return "bg-[#ddd6fe] text-violet-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Download PDF binary from an authenticated endpoint. */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Yetkisiz");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.message || `PDF hatası: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}


export type OrderDesignFile = {
  id: number;
  order_id: number;
  original_filename: string;
  stored_filename: string;
  content_type?: string | null;
  size_bytes: number;
  uploaded_by_user_id?: number | null;
  created_at: string;
};

export type PriceListItem = {
  id?: number;
  price_list_id?: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  unit_price: number;
  valid_from?: string | null;
  valid_to?: string | null;
  notes?: string | null;
};

export type PriceList = {
  id: number;
  name: string;
  description?: string | null;
  currency: string;
  is_active: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
  item_count?: number;
  created_at: string;
  updated_at: string;
  items?: PriceListItem[];
};

export type LoanInstallment = {
  id: number;
  loan_id: number;
  sequence: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at?: string | null;
  payment_method?: string | null;
  cash_register_id?: number | null;
  bank_account_id?: number | null;
  notes?: string | null;
};

export type Loan = {
  id: number;
  title: string;
  lender?: string | null;
  principal_amount: number;
  interest_rate?: number | null;
  start_date: string;
  installment_count: number;
  status: string;
  notes?: string | null;
  paid_count: number;
  unpaid_count: number;
  paid_amount: number;
  remaining_amount: number;
  this_month_due?: number;
  next_due_date?: string | null;
  overdue_count?: number;
  created_at: string;
  updated_at: string;
  installments?: LoanInstallment[];
};

export type AuditLog = {
  id: number;
  user_id?: number | null;
  user_email?: string | null;
  user_name?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  detail?: string | null;
  created_at: string;
};

export function designStatusBadgeClass(status: string): string {
  switch (status) {
    case "Bekliyor":
    case "bekliyor":
      return "bg-amber-100 text-amber-800";
    case "Onay İstendi":
      return "bg-sky-100 text-sky-800";
    case "Onaylandı":
    case "onaylandı":
      return "bg-emerald-100 text-emerald-800";
    case "Revizyon İstendi":
    case "revizyon":
      return "bg-orange-100 text-orange-800";
    case "Revize Edildi":
      return "bg-violet-100 text-violet-800";
    case "İptal":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Masaüstü siparis_merkezi kayit_tag satır renkleri */
export type OrderRowTag = "teklif" | "acik" | "geciken" | "hazir" | "teslim" | "iptal";

export function orderRowTag(o: {
  status: string;
  due_date?: string | null;
  is_quote?: boolean;
}): OrderRowTag {
  if (o.is_quote) return "teklif";
  if (o.status === "Teslim Edildi") return "teslim";
  if (o.status === "Sipariş İptali") return "iptal";
  if (o.status === "Hazır") return "hazir";
  if (o.due_date) {
    const d = String(o.due_date).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (d < today && o.status !== "Teslim Edildi" && o.status !== "Sipariş İptali") {
      return "geciken";
    }
  }
  return "acik";
}

export function orderRowTagClass(tag: OrderRowTag): string {
  switch (tag) {
    case "teklif":
      return "bg-[#f5f3ff]";
    case "acik":
      return "bg-[#eff6ff]";
    case "geciken":
      return "bg-[#fee2e2]";
    case "hazir":
      return "bg-[#dcfce7]";
    case "teslim":
      return "bg-[#e5e7eb]";
    case "iptal":
      return "bg-[#fef2f2] opacity-70";
    default:
      return "";
  }
}

/** Authenticated binary download (design files etc.). */
export async function downloadAuthFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Yetkisiz");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.message || `İndirme hatası: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export type Asset = {
  id: number;
  name: string;
  category?: string | null;
  serial_no?: string | null;
  purchase_date?: string | null;
  cost: number;
  current_value?: number | null;
  status?: string;
  maintenance_date?: string | null;
  depreciation_method: string;
  useful_life_months?: number | null;
  note?: string | null;
  active: boolean;
  book_value?: number | null;
  monthly_depreciation?: number | null;
  maintenance_due_soon?: boolean;
  created_at: string;
  updated_at: string;
};

export type DtfCalcResult = {
  film_cost: number;
  base_cost: number;
  waste_cost: number;
  total_cost: number;
  unit_cost: number;
  quantity: number;
};

export type DtfScenario = {
  id: number;
  name: string;
  film_m2: number;
  film_unit_price: number;
  ink_cost: number;
  labor_cost: number;
  waste_percent: number;
  quantity: number;
  note?: string | null;
  unit_cost?: number | null;
  total_cost?: number | null;
  created_at: string;
  updated_at: string;
};

export type SpecialDay = {
  id: number;
  name: string;
  event_date: string;
  day_type: string;
  customer_id?: number | null;
  customer_name?: string | null;
  note?: string | null;
  active: boolean;
  days_until?: number | null;
  created_at: string;
};

export type Campaign = {
  id: number;
  title: string;
  message_template: string;
  start_date?: string | null;
  end_date?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BackupInfo = {
  filename: string;
  size_bytes: number;
  created_at: string;
  path: string;
};

export type BizimHesapSettings = {
  api_key: string;
  api_secret: string;
  configured: boolean;
};

export type IntegrationActionResult = {
  ok: boolean;
  status: string;
  message: string;
  detail?: Record<string, unknown> | null;
};
