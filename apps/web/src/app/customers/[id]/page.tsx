"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CARI_TYPE_LABELS,
  CustomerDetail,
  CustomerStatement,
  apiFetch,
  formatMoney,
  statusBadgeClass,
  quoteStatusBadgeClass,
} from "@/lib/api";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [payType, setPayType] = useState<"payment" | "deposit" | "adjustment" | "sale">("payment");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [paySide, setPaySide] = useState<"debit" | "credit">("credit");

  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    company: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    tax_number: "",
    tax_office: "",
    notes: "",
    is_active: true,
    special_day_note: "",
    special_day_date: "",
    opening_balance: "0",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [detail, stmt] = await Promise.all([
        apiFetch<CustomerDetail>(`/api/customers/${id}`),
        apiFetch<CustomerStatement>(`/api/customers/${id}/statement`),
      ]);
      setCustomer(detail);
      setStatement(stmt);
      setEditForm({
        code: detail.code || "",
        name: detail.name || "",
        company: detail.company || "",
        email: detail.email || "",
        phone: detail.phone || "",
        city: detail.city || "",
        address: detail.address || "",
        tax_number: detail.tax_number || "",
        tax_office: detail.tax_office || "",
        notes: detail.notes || "",
        is_active: detail.is_active !== false,
        special_day_note: detail.special_day_note || "",
        special_day_date: detail.special_day_date || "",
        opening_balance: String(detail.opening_balance ?? 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: editForm.code.trim() || null,
          name: editForm.name.trim(),
          company: editForm.company.trim() || null,
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          address: editForm.address.trim() || null,
          tax_number: editForm.tax_number.trim() || null,
          tax_office: editForm.tax_office.trim() || null,
          notes: editForm.notes.trim() || null,
          is_active: editForm.is_active,
          special_day_note: editForm.special_day_note.trim() || null,
          special_day_date: editForm.special_day_date || null,
          opening_balance: Number(editForm.opening_balance || 0),
        }),
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Güncelleme hatası");
    } finally {
      setBusy(false);
    }
  }

  async function addMovement(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        movement_type: payType,
        amount: Number(payAmount),
        movement_date: payDate || null,
        note: payNote.trim() || null,
      };
      if (payType === "adjustment") body.side = paySide;
      await apiFetch(`/api/customers/${id}/movements`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPayAmount("");
      setPayNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hareket kaydı başarısız");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Müşteriyi silmek istiyor musunuz?")) return;
    await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
    router.push("/customers");
  }

  if (!customer && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }
  if (!customer) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/customers" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const bal = Number(customer.balance ?? 0);
  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/customers" className="text-baykus-primary hover:underline">Müşteriler</Link>
            <span className="mx-1">/</span>
            <span className="font-medium text-baykus-text">{customer.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-baykus-text mt-1">{customer.name}</h1>
          <p className="text-slate-500 text-sm">
            {customer.code ? `${customer.code} · ` : ""}
            {customer.company || "—"}
            {customer.is_active === false ? " · Pasif" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            {editing ? "Düzenlemeyi kapat" : "Düzenle"}
          </button>
          <button onClick={onDelete} className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm">
            Sil
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Cari bakiye (alacak)</div>
          <div className={`text-2xl font-bold tabular-nums ${bal > 0 ? "text-amber-700" : "text-slate-800"}`}>
            {formatMoney(bal)}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Açılış: {formatMoney(Number(customer.opening_balance ?? 0))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-3">İletişim</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-slate-500 text-xs">Telefon</dt>
              <dd>{customer.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">E-posta</dt>
              <dd>{customer.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">Şehir</dt>
              <dd>{customer.city || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs">Vergi</dt>
              <dd>
                {customer.tax_number || "—"}
                {customer.tax_office ? ` / ${customer.tax_office}` : ""}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500 text-xs">Adres</dt>
              <dd>{customer.address || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500 text-xs">Notlar</dt>
              <dd className="whitespace-pre-wrap">{customer.notes || "—"}</dd>
            </div>
            {(customer.special_day_note || customer.special_day_date) && (
              <div className="sm:col-span-2">
                <dt className="text-slate-500 text-xs">Özel gün</dt>
                <dd>
                  {customer.special_day_note || ""}
                  {customer.special_day_date ? ` (${customer.special_day_date})` : ""}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveEdit} className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-800">Kartı düzenle</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {(
              [
                ["code", "Kod"],
                ["name", "Ad *"],
                ["company", "Firma"],
                ["email", "E-posta"],
                ["phone", "Telefon"],
                ["city", "Şehir"],
                ["tax_number", "Vergi No"],
                ["tax_office", "Vergi Dairesi"],
                ["special_day_note", "Özel gün notu"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <input
                  className={input}
                  required={key === "name"}
                  value={editForm[key]}
                  onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Özel gün tarihi</label>
              <input
                type="date"
                className={input}
                value={editForm.special_day_date}
                onChange={(e) => setEditForm({ ...editForm, special_day_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Açılış bakiyesi</label>
              <input
                type="number"
                step="0.01"
                className={input}
                value={editForm.opening_balance}
                onChange={(e) => setEditForm({ ...editForm, opening_balance: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
              />
              <span className="text-sm">Aktif</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Adres</label>
            <textarea
              rows={2}
              className={input}
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notlar</label>
            <textarea
              rows={2}
              className={input}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            Kaydet
          </button>
        </form>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <form
          onSubmit={addMovement}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
        >
          <h2 className="font-semibold text-slate-800">Cari hareket ekle</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tip</label>
            <select
              className={input}
              value={payType}
              onChange={(e) => setPayType(e.target.value as typeof payType)}
            >
              <option value="payment">Ödeme</option>
              <option value="deposit">Kapora / Depozito</option>
              <option value="sale">Satış (borç)</option>
              <option value="adjustment">Düzeltme</option>
            </select>
          </div>
          {payType === "adjustment" && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Yön</label>
              <select
                className={input}
                value={paySide}
                onChange={(e) => setPaySide(e.target.value as "debit" | "credit")}
              >
                <option value="debit">Borç (+)</option>
                <option value="credit">Alacak (−)</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tutar (₺)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              className={input}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tarih</label>
            <input
              type="date"
              className={input}
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Not</label>
            <input className={input} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-baykus-600 text-white py-2 text-sm font-medium disabled:opacity-60"
          >
            Kaydet
          </button>
        </form>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Ekstre</h2>
            {statement && (
              <span className="text-xs text-slate-500">
                Kapanış: {formatMoney(Number(statement.closing_balance))}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-2">Tarih</th>
                  <th className="px-4 py-2">Tip</th>
                  <th className="px-4 py-2">Not / Sipariş</th>
                  <th className="px-4 py-2 text-right">Borç</th>
                  <th className="px-4 py-2 text-right">Alacak</th>
                  <th className="px-4 py-2 text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {statement && (
                  <tr className="border-t border-slate-100 bg-slate-50/50">
                    <td className="px-4 py-2 text-slate-500" colSpan={5}>
                      Açılış bakiyesi
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {formatMoney(Number(statement.opening_balance))}
                    </td>
                  </tr>
                )}
                {(statement?.movements || []).map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap">{m.movement_date}</td>
                    <td className="px-4 py-2">{CARI_TYPE_LABELS[m.movement_type] || m.movement_type}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {m.note || "—"}
                      {m.order_number && (
                        <>
                          {" "}
                          <Link
                            href={`/orders/${m.order_id}`}
                            className="text-baykus-600 hover:underline"
                          >
                            {m.order_number}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {Number(m.debit) > 0 ? formatMoney(Number(m.debit)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {Number(m.credit) > 0 ? formatMoney(Number(m.credit)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {m.running_balance != null ? formatMoney(Number(m.running_balance)) : "—"}
                    </td>
                  </tr>
                ))}
                {(!statement || statement.movements.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Hareket yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">

        <div className="rounded-xl border border-baykus-line bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-baykus-line flex items-center justify-between">
            <h2 className="font-semibold text-baykus-text">Son teklifler</h2>
            <Link href={`/quotes/new?customer_id=${customer.id}`} className="text-xs text-baykus-primary hover:underline">
              + Teklif
            </Link>
          </div>
          <ul className="divide-y divide-baykus-line text-sm">
            {(customer.recent_quotes || []).map((q) => (
              <li key={q.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/quotes/${q.id}`} className="font-medium text-baykus-primary hover:underline">
                    {q.quote_number}
                  </Link>
                  <div className="text-xs text-baykus-muted mt-0.5">
                    {q.created_at?.slice(0, 10)} · {formatMoney(Number(q.total_amount))}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${quoteStatusBadgeClass(q.status)}`}>
                  {q.status}
                </span>
              </li>
            ))}
            {(customer.recent_quotes || []).length === 0 && (
              <li className="px-5 py-6 text-center text-baykus-muted">Teklif yok</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Son siparişler</h2>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {(customer.recent_orders || []).map((o) => (
              <li key={o.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/orders/${o.id}`} className="font-medium text-baykus-700 hover:underline">
                    {o.order_number}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {o.created_at?.slice(0, 10)} · kalan {formatMoney(Number(o.remaining_amount))}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(o.status)}`}>
                  {o.status}
                </span>
              </li>
            ))}
            {(customer.recent_orders || []).length === 0 && (
              <li className="px-5 py-6 text-center text-slate-400">Sipariş yok</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Zaman çizelgesi</h2>
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {(customer.timeline || []).map((t, i) => (
              <li key={i} className="px-5 py-3">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {t.kind === "order"
                      ? "🛒 "
                      : t.kind === "movement"
                        ? "📒 "
                        : "📝 "}
                    {t.kind === "movement"
                      ? CARI_TYPE_LABELS[t.label] || t.label
                      : t.label}
                  </span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{t.date || ""}</span>
                </div>
                {t.note && <p className="text-slate-500 text-xs mt-1">{t.note}</p>}
                {t.amount != null && (
                  <p className="text-xs text-slate-500 mt-1">{formatMoney(t.amount)}</p>
                )}
                {(t.debit || t.credit) && (
                  <p className="text-xs text-slate-500 mt-1">
                    {t.debit ? `Borç ${formatMoney(t.debit)}` : ""}
                    {t.credit ? `Alacak ${formatMoney(t.credit)}` : ""}
                  </p>
                )}
              </li>
            ))}
            {(customer.timeline || []).length === 0 && (
              <li className="px-5 py-6 text-center text-slate-400">Kayıt yok</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
