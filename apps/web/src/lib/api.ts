const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export type CustomerDetail = Customer & {
  recent_orders: CustomerOrderBrief[];
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

export type DashboardSummary = {
  orders_today_count: number;
  orders_today_revenue: number;
  orders_month_count: number;
  orders_month_revenue: number;
  open_orders: number;
  status_counts: DashboardStatusCount[];
  critical_stock_count: number;
  low_stock_items: DashboardLowStock[];
  customer_count: number;
  receivables_total: number;
  receivables_customer_count: number;
  cash_balance: number;
  bank_balance: number;
  total_liquidity: number;
  recent_orders: DashboardRecentOrder[];
  recent_cari_payments: DashboardCariPayment[];
  recent_finance_movements: DashboardFinanceMovement[];
  products_count: number;
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

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "Sipariş Alındı":
      return "bg-sky-100 text-sky-800";
    case "Hazırlanıyor":
      return "bg-amber-100 text-amber-800";
    case "Baskıda":
      return "bg-violet-100 text-violet-800";
    case "Hazır":
      return "bg-emerald-100 text-emerald-800";
    case "Teslim Edildi":
      return "bg-slate-200 text-slate-700";
    case "Sipariş İptali":
      return "bg-red-100 text-red-800";
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
  iban?: string | null;
  currency: string;
  opening_balance: number;
  is_active: boolean;
  notes?: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
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


export const ORDER_CHANNELS = ["mağaza", "internet", "Trendyol", "Hepsiburada", "N11", "diğer"] as const;
export const DESIGN_STATUSES = ["bekliyor", "onaylandı", "revizyon"] as const;

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
  theme_label: string;
};

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
  payment_method: string;
  note?: string | null;
  cash_register_id?: number | null;
  bank_account_id?: number | null;
  is_posted: boolean;
  created_by_user_id?: number | null;
  created_at: string;
};

export function quoteStatusBadgeClass(status: string): string {
  switch (status) {
    case "Taslak":
      return "bg-slate-100 text-slate-700";
    case "Gönderildi":
      return "bg-sky-100 text-sky-800";
    case "Onaylandı":
      return "bg-emerald-100 text-emerald-800";
    case "Reddedildi":
      return "bg-red-100 text-red-800";
    case "Siparişe Dönüştü":
      return "bg-violet-100 text-violet-800";
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
    case "bekliyor":
      return "bg-amber-100 text-amber-800";
    case "onaylandı":
      return "bg-emerald-100 text-emerald-800";
    case "revizyon":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-slate-100 text-slate-700";
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
