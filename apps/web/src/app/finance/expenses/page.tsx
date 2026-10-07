"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BankAccount, CashRegister, Expense, ExpenseCategory, apiFetch, formatMoney } from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import { sanitizeDisplayNote } from "@/lib/bhNote";
import { formatTrDate, localToday } from "@/lib/dates";
import { useDateSort } from "@/hooks/useDateSort";
import SortableDateHeader from "@/components/SortableDateHeader";

const PERIODS = [
  { key: "30", label: "Son 30 Gün", days: 30 },
  { key: "92", label: "Son 3 Ay", days: 92 },
  { key: "184", label: "Son 6 Ay", days: 184 },
  { key: "year", label: "Bu Yıl", days: null },
  { key: "all", label: "Tümü", days: null },
] as const;

const STATUS_CHIPS = ["Tümü", "Ödenmiş", "Ödenecek", "Gecikmiş"] as const;


const MASRAF_GRUPLARI = ["Araç Giderleri", "İşletme Giderleri", "Mali Giderler", "Personel Giderleri", "Diğer Giderler"] as const;

function categoryGroup(c: ExpenseCategory): string {
  return c.group_name || "İşletme Giderleri";
}

/** BizimHesap-style: parent optgroup labels, child name only under each. */
function groupCategories(cats: ExpenseCategory[]): { group: string; items: ExpenseCategory[] }[] {
  const active = cats.filter((c) => c.is_active !== false);
  const map = new Map<string, ExpenseCategory[]>();
  for (const c of active) {
    const g = categoryGroup(c);
    const list = map.get(g) || [];
    list.push(c);
    map.set(g, list);
  }
  const ordered: { group: string; items: ExpenseCategory[] }[] = [];
  for (const g of MASRAF_GRUPLARI) {
    const items = map.get(g);
    if (items?.length) {
      ordered.push({ group: g, items: [...items].sort((a, b) => a.name.localeCompare(b.name, "tr")) });
      map.delete(g);
    }
  }
  for (const [g, items] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"))) {
    ordered.push({ group: g, items: [...items].sort((a, b) => a.name.localeCompare(b.name, "tr")) });
  }
  return ordered;
}

function periodFrom(key: string): string | "" {
  const today = new Date();
  if (key === "all") return "";
  if (key === "year") return `${today.getFullYear()}-01-01`;
  const p = PERIODS.find((x) => x.key === key);
  if (!p || p.days == null) return "";
  const d = new Date(today);
  d.setDate(d.getDate() - p.days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [cashRegs, setCashRegs] = useState<CashRegister[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [period, setPeriod] = useState("92");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_CHIPS)[number]>("Tümü");
  const [showCancel, setShowCancel] = useState(false);
  const [q, setQ] = useState("");
  const [showCat, setShowCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catGroup, setCatGroup] = useState<string>("İşletme Giderleri");
  const [catDesc, setCatDesc] = useState("");
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [form, setForm] = useState({
    category_id: "",
    amount: "",
    expense_date: localToday(),
    due_date: "",
    document_no: "",
    payment_method: "nakit",
    cash_register_id: "",
    bank_account_id: "",
    note: "",
    post_immediately: true,
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      const from = periodFrom(period);
      if (from) params.set("date_from", from);
      if (statusFilter !== "Tümü") params.set("status_filter", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      if (showCancel) params.set("include_cancelled", "true");
      params.set("limit", "2000");
      const [e, c, regs, bankList] = await Promise.all([
        apiFetch<Expense[]>(`/api/finance/expenses?${params}`),
        apiFetch<ExpenseCategory[]>("/api/finance/expenses/categories"),
        apiFetch<CashRegister[]>("/api/finance/cash?active=true"),
        apiFetch<BankAccount[]>("/api/finance/banks?active=true"),
      ]);
      const activeRegs = regs.filter((r) => r.is_active !== false);
      const activeBanks = bankList.filter((b) => b.is_active !== false);
      setItems(e);
      setCategories(c);
      setCashRegs(activeRegs);
      setBanks(activeBanks);
      setForm((f) => ({
        ...f,
        category_id: f.category_id || (c.length ? String(c[0].id) : ""),
        cash_register_id:
          f.cash_register_id || (activeRegs.length ? String(activeRegs[0].id) : ""),
        bank_account_id:
          f.bank_account_id || (activeBanks.length ? String(activeBanks[0].id) : ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }, [period, statusFilter, q, showCancel]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => items.filter((i) => !i.is_cancelled).reduce((s, i) => s + Number(i.amount), 0),
    [items],
  );
  const { dir: dateDir, setDir: setDateDir, sorted: sortedRows } = useDateSort(
    items,
    (e) => e.expense_date,
    (e) => e.id,
  );


  async function addCategory(e: FormEvent) {
    e.preventDefault();
    try {
      if (editCatId) {
        await apiFetch(`/api/finance/expenses/categories/${editCatId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: catName,
            group_name: catGroup,
            description: catDesc || null,
          }),
        });
        setMsg("Masraf kalemi güncellendi");
      } else {
        await apiFetch("/api/finance/expenses/categories", {
          method: "POST",
          body: JSON.stringify({
            name: catName,
            group_name: catGroup,
            description: catDesc || null,
          }),
        });
        setMsg("Masraf kalemi eklendi");
      }
      setCatName("");
      setCatDesc("");
      setCatGroup("İşletme Giderleri");
      setEditCatId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori hatası");
    }
  }

  async function removeCategory(id: number) {
    if (!confirm("Kalem silinsin mi?")) return;
    try {
      await apiFetch(`/api/finance/expenses/categories/${id}`, { method: "DELETE" });
      setMsg("Kalem silindi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function toggleCategoryActive(c: ExpenseCategory) {
    try {
      await apiFetch(`/api/finance/expenses/categories/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme hatası");
    }
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (form.payment_method === "banka" && !form.bank_account_id) {
      setError("Banka ödemesi için hesap seçin");
      return;
    }
    if (form.payment_method === "nakit" && !form.cash_register_id && cashRegs.length > 0) {
      setError("Nakit ödeme için kasa seçin");
      return;
    }
    try {
      await apiFetch("/api/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          category_id: Number(form.category_id),
          amount: Number(form.amount),
          expense_date: form.expense_date,
          due_date: form.due_date || null,
          document_no: form.document_no || null,
          payment_method: form.payment_method,
          cash_register_id:
            form.payment_method === "nakit" && form.cash_register_id
              ? Number(form.cash_register_id)
              : null,
          bank_account_id:
            form.payment_method === "banka" && form.bank_account_id
              ? Number(form.bank_account_id)
              : null,
          note: form.note || null,
          post_immediately: form.post_immediately,
        }),
      });
      setForm((f) => ({ ...f, amount: "", note: "", document_no: "", due_date: "" }));
      setMsg("Masraf kaydedildi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gider kaydı başarısız");
    }
  }

  async function postExpense(id: number) {
    try {
      await apiFetch(`/api/finance/expenses/${id}/post`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşleme hatası");
    }
  }

  async function removeExpense(id: number) {
    if (!confirm("Silinsin mi?")) return;
    try {
      await apiFetch(`/api/finance/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function cancelExpense(id: number) {
    if (
      !confirm(
        "Bu masraf iptal edilsin mi?\nBağlı kasa/banka hareketleri kaldırılacak; masraf listeden düşecek.",
      )
    )
      return;
    setError("");
    setMsg("");
    try {
      await apiFetch(`/api/finance/expenses/${id}/cancel`, { method: "POST" });
      setMsg("Masraf iptal edildi");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İptal hatası");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Masraflar</h2>
          <p className="text-xs text-baykus-muted">Finans › Masraflar · kalem · vade · kasa/banka işleme</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="bk-btn bk-btn-ghost text-xs">
            ← Finans
          </Link>
          <Link href="/reports/expenses" className="bk-btn bk-btn-ghost text-xs">
            Masraf raporu
          </Link>
          <button
            type="button"
            className="bk-btn text-xs text-white"
            style={{ background: "#198754" }}
            onClick={() => setShowCat((v) => !v)}
          >
            ✎ Masraf Kalemleri
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      {msg && <div className="rounded bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">{msg}</div>}

      {showCat && (
        <div className="bk-card p-3 space-y-3 text-sm">
          <div className="font-semibold text-sm">Ana Grup / Alt Masraf Kalemi</div>
          <form onSubmit={addCategory} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Ana Grup</label>
              <select className="bk-input" value={catGroup} onChange={(e) => setCatGroup(e.target.value)}>
                {MASRAF_GRUPLARI.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Alt Kalem</label>
              <input
                required
                className="bk-input min-w-[12rem]"
                placeholder="Kalem adı"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-[11px] text-slate-500 mb-1">Açıklama</label>
              <input
                className="bk-input w-full"
                placeholder="Opsiyonel"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
              />
            </div>
            <button type="submit" className="bk-btn bk-btn-primary text-xs">
              {editCatId ? "Kaydet / Güncelle" : "Kalem ekle"}
            </button>
            {editCatId && (
              <button
                type="button"
                className="bk-btn bk-btn-ghost text-xs"
                onClick={() => {
                  setEditCatId(null);
                  setCatName("");
                  setCatDesc("");
                }}
              >
                Temizle
              </button>
            )}
          </form>
          <div className="bk-table-wrap max-h-64 overflow-auto">
            <table className="bk-table text-xs">
              <thead>
                <tr>
                  <th>Ana Masraf Grubu / Alt Kalem</th>
                  <th>Açıklama</th>
                  <th>Aktif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {MASRAF_GRUPLARI.flatMap((g) => {
                  const items = categories.filter((c) => categoryGroup(c) === g);
                  return [
                    <tr key={`g-${g}`} className="bg-slate-100">
                      <td colSpan={4} className="font-bold text-slate-700">
                        {g} ({items.length})
                      </td>
                    </tr>,
                    ...items.map((c) => (
                      <tr key={c.id} className={!c.is_active ? "opacity-50" : undefined}>
                        <td className="pl-6">{c.name}</td>
                        <td className="text-slate-500">{c.description || "—"}</td>
                        <td>{c.is_active ? "Evet" : "Hayır"}</td>
                        <td className="whitespace-nowrap space-x-1">
                          <button
                            type="button"
                            className="text-baykus-primary hover:underline"
                            onClick={() => {
                              setEditCatId(c.id);
                              setCatName(c.name);
                              setCatGroup(categoryGroup(c));
                              setCatDesc(c.description || "");
                            }}
                          >
                            Düzenle
                          </button>
                          <button type="button" className="text-slate-500 hover:underline" onClick={() => void toggleCategoryActive(c)}>
                            {c.is_active ? "Pasif" : "Aktif"}
                          </button>
                          <button type="button" className="text-red-600 hover:underline" onClick={() => void removeCategory(c.id)}>
                            Sil
                          </button>
                        </td>
                      </tr>
                    )),
                  ];
                })}
                {categories
                  .filter((c) => !MASRAF_GRUPLARI.includes(categoryGroup(c) as (typeof MASRAF_GRUPLARI)[number]))
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="text-slate-400">{c.group_name || "—"} / </span>
                        {c.name}
                      </td>
                      <td>{c.description || "—"}</td>
                      <td>{c.is_active ? "Evet" : "Hayır"}</td>
                      <td>
                        <button type="button" className="text-red-600" onClick={() => void removeCategory(c.id)}>
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <form onSubmit={addExpense} className="bk-card p-3 grid md:grid-cols-4 gap-2 text-sm">
        <div className="md:col-span-4 font-semibold text-sm flex items-center gap-2">
          <span
            className="inline-flex rounded px-2 py-1 text-xs text-white"
            style={{ background: "#dc2626" }}
          >
            + Yeni Masraf Gir
          </span>
        </div>
        <select
          className="bk-input"
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          required
          title="Ana masraf grubu altında alt kalem"
        >
          <option value="">Masraf kalemi seçin</option>
          {groupCategories(categories).map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          required
          type="number"
          min="0.01"
          step="0.01"
          className="bk-input"
          placeholder="Tutar"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          type="date"
          className="bk-input"
          value={form.expense_date}
          onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
        />
        <input
          type="date"
          className="bk-input"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          title="Vade"
        />
        <input
          className="bk-input"
          placeholder="Belge No"
          value={form.document_no}
          onChange={(e) => setForm({ ...form, document_no: e.target.value })}
        />
        <select
          className="bk-input"
          value={form.payment_method}
          onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
        >
          <option value="nakit">Kasa (Nakit)</option>
          <option value="banka">Banka</option>
        </select>
        {form.payment_method === "nakit" ? (
          <select
            className="bk-input"
            value={form.cash_register_id}
            onChange={(e) => setForm({ ...form, cash_register_id: e.target.value })}
            required
          >
            <option value="">Kasa seçin</option>
            {cashRegs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {typeof r.balance === "number" ? ` (${formatMoney(r.balance)})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <select
            className="bk-input"
            value={form.bank_account_id}
            onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
            required
          >
            <option value="">Banka / hesap seçin</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {(b.account_type ? `${b.account_type} · ` : "") + b.name}
                {typeof b.balance === "number" ? ` (${formatMoney(b.balance)})` : ""}
              </option>
            ))}
          </select>
        )}
        <input
          className="bk-input md:col-span-2"
          placeholder="Not"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.post_immediately}
            onChange={(e) => setForm({ ...form, post_immediately: e.target.checked })}
          />
          Hemen işle (kasa/banka)
        </label>
        <button type="submit" className="bk-btn bk-btn-primary text-xs">
          Kaydet
        </button>
      </form>

      <div className="bk-filter-bar">
        <select className="bk-input max-w-[140px]" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-1 text-[11px] font-medium border ${
                statusFilter === s ? "border-baykus-primary ring-1 ring-baykus-primary" : "border-slate-200"
              } ${
                s === "Gecikmiş"
                  ? "bg-red-50 text-red-800"
                  : s === "Ödenecek"
                    ? "bg-amber-50 text-amber-900"
                    : s === "Ödenmiş"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-bold ml-2">
          <input
            type="checkbox"
            checked={showCancel}
            onChange={(e) => setShowCancel(e.target.checked)}
          />
          İptalleri de göster
        </label>
        <input
          className="bk-input max-w-[200px] ml-auto"
          placeholder="Ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bk-kpi-strip" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="bk-kpi-card" style={{ backgroundColor: "#334155" }}>
          <span className="bk-kpi-icon">☰</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Listelenen</div>
            <div className="bk-kpi-value">{items.length}</div>
          </div>
        </div>
        <div className="bk-kpi-card" style={{ backgroundColor: "#be123c" }}>
          <span className="bk-kpi-icon">₺</span>
          <div className="min-w-0 flex-1 text-right">
            <div className="bk-kpi-label">Toplam</div>
            <div className="bk-kpi-value truncate">{formatMoney(total)}</div>
          </div>
        </div>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th className="bk-th-sortable"><SortableDateHeader dir={dateDir} onChange={setDateDir} label="İşlem Tarihi" /></th>
              <th>Belge No</th>
              <th>Vadesi</th>
              <th>Masraf</th>
              <th>Hesap</th>
              <th className="text-right">Tutar</th>
              <th>Ödeme</th>
              <th>Durumu</th>
              <th>Not</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((e) => {
              const cancelled = !!e.is_cancelled || e.status_label === "İptal";
              const st =
                e.status_label ||
                (cancelled ? "İptal" : e.is_posted ? "Ödenmiş" : "Ödenecek");
              return (
                <tr
                  key={e.id}
                  className={
                    cancelled
                      ? "bg-slate-100 opacity-70"
                      : st === "Gecikmiş"
                        ? "bg-red-50"
                        : st === "Ödenecek"
                          ? "bg-amber-50"
                          : undefined
                  }
                >
                  <td className="text-xs whitespace-nowrap">{formatTrDate(e.expense_date)}</td>
                  <td className="text-xs">{e.document_no || "—"}</td>
                  <td className="text-xs">{formatTrDate(e.due_date)}</td>
                  <td className="font-medium text-sm">
                    <div>{e.category_name || "—"}</div>
                    {e.category_group_name ? (
                      <div className="text-[10px] font-normal text-slate-400">{e.category_group_name}</div>
                    ) : null}
                  </td>
                  <td className="text-xs">
                    {e.payment_method === "banka"
                      ? e.bank_account_name || "Banka"
                      : e.cash_register_name || "Kasa"}
                  </td>
                  <td className="text-right tabular-nums font-semibold">{formatMoney(Number(e.amount))}</td>
                  <td className="text-xs">{e.payment_method}</td>
                  <td>
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        st === "İptal"
                          ? "bg-slate-200 text-slate-700"
                          : st === "Ödenmiş"
                            ? "bg-emerald-100 text-emerald-800"
                            : st === "Gecikmiş"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {st}
                    </span>
                  </td>
                  <td className="text-xs text-baykus-muted max-w-[160px] truncate">{sanitizeDisplayNote(e.note) || "—"}</td>
                  <td className="text-right text-xs whitespace-nowrap space-x-2">
                    {!cancelled && !e.is_posted && (
                      <>
                        <button
                          type="button"
                          className="text-emerald-700 font-semibold hover:underline"
                          onClick={() => postExpense(e.id)}
                        >
                          İşle
                        </button>
                        <button type="button" className="text-red-600 hover:underline" onClick={() => removeExpense(e.id)}>
                          Sil
                        </button>
                      </>
                    )}
                    {!cancelled && (
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() => void cancelExpense(e.id)}
                      >
                        İptal
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-baykus-muted py-8">
                  Masraf yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <StatusFooter onRefresh={load} />
    </div>
  );
}