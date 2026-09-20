"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CARI_TYPE_LABELS,
  CustomerDetail,
  CustomerStatement,
  WhatsAppTemplate,
  apiFetch,
  downloadPdf,
  formatMoney,
  statusBadgeClass,
  quoteStatusBadgeClass,
} from "@/lib/api";

type TabKey = "bilgi" | "hareketler" | "siparisler" | "notlar" | "whatsapp";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabKey>("bilgi");
  const [showPay, setShowPay] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

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
      const bal = Number(detail.balance ?? 0);
      if (bal > 0) setPayAmount(String(bal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    load();
  }, [id, load]);

  useEffect(() => {
    apiFetch<WhatsAppTemplate[]>("/api/whatsapp/templates")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const ozet = useMemo(() => {
    const moves = statement?.movements || [];
    const totalBorc =
      Number(statement?.opening_balance ?? customer?.opening_balance ?? 0) +
      moves.reduce((s, m) => s + Number(m.debit || 0), 0);
    const totalTahsilat = moves.reduce((s, m) => s + Number(m.credit || 0), 0);
    const orders = customer?.recent_orders || [];
    const last = orders[0];
    return {
      acik: Number(customer?.balance ?? statement?.closing_balance ?? 0),
      toplamBorc: totalBorc,
      toplamTahsilat: totalTahsilat,
      siparisSayisi: orders.length,
      sonSatis: last
        ? `${last.order_number} · ${last.created_at?.slice(0, 10) || ""}`
        : "—",
      sonSatisId: last?.id,
    };
  }, [customer, statement]);

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
      setOkMsg("Kart kaydedildi");
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
      setShowPay(false);
      setOkMsg("Tahsilat / hareket kaydedildi");
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

  function openWa(tpl?: WhatsAppTemplate) {
    const phone = (customer?.phone || "").replace(/\D/g, "");
    if (!phone) {
      setError("Telefon yok — WhatsApp açılamaz");
      setTab("whatsapp");
      return;
    }
    let digits = phone;
    if (digits.startsWith("0")) digits = "90" + digits.slice(1);
    if (!digits.startsWith("90")) digits = "90" + digits;
    const text = tpl?.body
      ? encodeURIComponent(
          tpl.body
            .replace(/\{musteri\}/gi, customer?.name || "")
            .replace(/\{ad\}/gi, customer?.name || "")
            .replace(/\{bakiye\}/gi, formatMoney(ozet.acik)),
        )
      : encodeURIComponent(`Merhaba ${customer?.name || ""},`);
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
  }

  async function downloadCariPdf() {
    try {
      await downloadPdf(
        `/api/reports/cari-statements?customer_id=${id}&format=pdf`,
        `cari_dokum_${id}.pdf`,
      );
      setOkMsg("Cari döküm PDF indirildi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    }
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

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  const tabs: { key: TabKey; label: string }[] = [
    { key: "bilgi", label: "Bilgi" },
    { key: "hareketler", label: "Hareketler" },
    { key: "siparisler", label: "Siparişler" },
    { key: "notlar", label: "Notlar" },
    { key: "whatsapp", label: "WhatsApp" },
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumb + identity */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/customers" className="text-baykus-primary hover:underline">
              Müşteri Merkezi
            </Link>
            <span className="mx-1">›</span>
            <span className="font-medium text-baykus-text">{customer.name}</span>
          </div>
          <div className="rounded-xl border border-[#bfdbfe] bg-[#e8f1ff] px-4 py-3 mt-1">
            <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {[customer.code, customer.company, customer.phone, customer.city]
                .filter(Boolean)
                .join("  |  ") || "Müşteri özel bilgisi kaydedilmemiş."}
              {customer.is_active === false ? " · Pasif" : ""}
            </p>
          </div>
        </div>
        <div
          className="rounded-xl border-4 border-slate-500 bg-[#fffde7] px-4 py-3 max-w-md text-sm text-emerald-700 min-w-[220px]"
        >
          {(customer.notes || "").trim() || "Bu müşteri için özel not bulunmuyor."}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}
      {okMsg && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{okMsg}</div>}

      {/* Özet kartlar — musteri_kart_ozeti */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#e68778" }}>
          <div className="text-[11px] font-bold opacity-95 text-center">Açık Bakiye</div>
          <div className="text-xl font-bold tabular-nums text-center">{formatMoney(ozet.acik)}</div>
          <div className="text-[10px] text-center opacity-90">
            {ozet.acik > 0 ? "müşteri borcu" : "borç yok"}
          </div>
        </div>
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#7fb5df" }}>
          <div className="text-[11px] font-bold opacity-95 text-center">Toplam Borç</div>
          <div className="text-xl font-bold tabular-nums text-center">{formatMoney(ozet.toplamBorc)}</div>
          <div className="text-[10px] text-center opacity-90">{ozet.siparisSayisi} sipariş</div>
        </div>
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#8bd0a7" }}>
          <div className="text-[11px] font-bold opacity-95 text-center">Toplam Tahsilat</div>
          <div className="text-xl font-bold tabular-nums text-center">
            {formatMoney(ozet.toplamTahsilat)}
          </div>
          <div className="text-[10px] text-center opacity-90">
            Son satış:{" "}
            {ozet.sonSatisId ? (
              <Link href={`/orders/${ozet.sonSatisId}`} className="underline text-white">
                {ozet.sonSatis}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {/* İşlemler — desktop buttons */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/sales/create?type=kayitli&customer_id=${id}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#334155" }}
        >
          🛒 Satış Yap
        </Link>
        <Link
          href={`/quotes/new?customer_id=${id}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#1f6feb" }}
        >
          Yeni Teklif
        </Link>
        <button
          type="button"
          onClick={() => {
            setShowPay(true);
            setTab("hareketler");
            setPayType("payment");
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#198754" }}
        >
          Tahsilat Al
        </button>
        <button
          type="button"
          onClick={() => openWa()}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#15803d" }}
        >
          WhatsApp Gönder
        </button>
        <button
          type="button"
          onClick={() => void downloadCariPdf()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          Cari Döküm PDF
        </button>
        <a
          href={`/api/reports/cari-statements?customer_id=${id}&format=html`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#7c3aed" }}
          onClick={(e) => {
            // open printable mutabakat-style HTML
            e.preventDefault();
            window.open(
              `/reports/cari-statements?customer_id=${id}`,
              "_blank",
            );
          }}
        >
          Mutabakat / Ekstre
        </a>
        <Link
          href={`/customers/track?customer_id=${id}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#64748b" }}
        >
          Müşteri Takibi
        </Link>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setTab("bilgi");
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#0f766e" }}
        >
          Devir Bakiye / Düzenle
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-sm"
        >
          Sil
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key
                ? "border-baykus-600 text-baykus-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bilgi" && (
        <div className="space-y-4">
          {!editing ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex justify-between mb-3">
                <h2 className="font-semibold text-slate-800">Kart bilgileri</h2>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-sm text-baykus-600 hover:underline"
                >
                  Düzenle
                </button>
              </div>
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
                <div>
                  <dt className="text-slate-500 text-xs">Açılış / Devir bakiyesi</dt>
                  <dd className="tabular-nums font-medium">
                    {formatMoney(Number(customer.opening_balance ?? 0))}
                  </dd>
                </div>
                {(customer.special_day_note || customer.special_day_date) && (
                  <div>
                    <dt className="text-slate-500 text-xs">Özel gün</dt>
                    <dd>
                      {customer.special_day_note || ""}
                      {customer.special_day_date ? ` (${customer.special_day_date})` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ) : (
            <form
              onSubmit={saveEdit}
              data-baykus-save
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
            >
              <h2 className="font-semibold text-slate-800">Kartı düzenle / Devir bakiye</h2>
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
                  <label className="block text-xs text-slate-500 mb-1">Devir / açılış bakiyesi</label>
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
              <div className="flex gap-2">
                <button
                  type="submit"
                  data-baykus-save
                  disabled={busy}
                  className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
                >
                  Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  Vazgeç
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {tab === "hareketler" && (
        <div className="grid lg:grid-cols-3 gap-6">
          {(showPay || true) && (
            <form
              onSubmit={addMovement}
              data-baykus-save
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
            >
              <h2 className="font-semibold text-slate-800">Tahsilat / cari hareket</h2>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tip</label>
                <select
                  className={input}
                  value={payType}
                  onChange={(e) => setPayType(e.target.value as typeof payType)}
                >
                  <option value="payment">Ödeme / Tahsilat</option>
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
                data-baykus-save
                disabled={busy}
                className="w-full rounded-lg bg-[#198754] text-white py-2 text-sm font-medium disabled:opacity-60"
              >
                Kaydet
              </button>
            </form>
          )}

          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-semibold text-slate-800">Ekstre / Hareketler</h2>
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
                            <Link href={`/orders/${m.order_id}`} className="text-baykus-600 hover:underline">
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
      )}

      {tab === "siparisler" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b flex justify-between">
              <h2 className="font-semibold">Son siparişler</h2>
              <Link href={`/sales/create?type=kayitli&customer_id=${id}`} className="text-xs text-baykus-primary hover:underline">
                + Satış
              </Link>
            </div>
            <ul className="divide-y text-sm">
              {(customer.recent_orders || []).map((o) => (
                <li key={o.id} className="px-5 py-3 flex justify-between gap-3">
                  <div>
                    <Link href={`/orders/${o.id}`} className="font-medium text-baykus-700 hover:underline">
                      {o.order_number}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {o.created_at?.slice(0, 10)} · kalan {formatMoney(Number(o.remaining_amount))}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs h-fit ${statusBadgeClass(o.status)}`}>
                    {o.status}
                  </span>
                </li>
              ))}
              {(customer.recent_orders || []).length === 0 && (
                <li className="px-5 py-6 text-center text-slate-400">Sipariş yok</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b flex justify-between">
              <h2 className="font-semibold">Son teklifler</h2>
              <Link href={`/quotes/new?customer_id=${id}`} className="text-xs text-baykus-primary hover:underline">
                + Teklif
              </Link>
            </div>
            <ul className="divide-y text-sm">
              {(customer.recent_quotes || []).map((q) => (
                <li key={q.id} className="px-5 py-3 flex justify-between gap-3">
                  <div>
                    <Link href={`/quotes/${q.id}`} className="font-medium text-baykus-primary hover:underline">
                      {q.quote_number}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {q.created_at?.slice(0, 10)} · {formatMoney(Number(q.total_amount))}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${quoteStatusBadgeClass(q.status)}`}>
                    {q.status}
                  </span>
                </li>
              ))}
              {(customer.recent_quotes || []).length === 0 && (
                <li className="px-5 py-6 text-center text-slate-400">Teklif yok</li>
              )}
            </ul>
          </div>
          <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h2 className="font-semibold">Zaman çizelgesi</h2>
            </div>
            <ul className="divide-y text-sm">
              {(customer.timeline || []).map((t, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {t.kind === "order" ? "🛒 " : t.kind === "movement" ? "📒 " : "📝 "}
                      {t.kind === "movement" ? CARI_TYPE_LABELS[t.label] || t.label : t.label}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{t.date || ""}</span>
                  </div>
                  {t.note && <p className="text-slate-500 text-xs mt-1">{t.note}</p>}
                  {t.amount != null && (
                    <p className="text-xs text-slate-500 mt-1">{formatMoney(t.amount)}</p>
                  )}
                </li>
              ))}
              {(customer.timeline || []).length === 0 && (
                <li className="px-5 py-6 text-center text-slate-400">Kayıt yok</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {tab === "notlar" && (
        <form
          onSubmit={saveEdit}
          data-baykus-save
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 max-w-2xl"
        >
          <h2 className="font-semibold">Özel not</h2>
          <textarea
            rows={6}
            className={input}
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            placeholder="Müşteri özel notu…"
          />
          <button
            type="submit"
            data-baykus-save
            disabled={busy}
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            Kaydet
          </button>
        </form>
      )}

      {tab === "whatsapp" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-emerald-950">WhatsApp (wa.me — Selenium yok)</h2>
          <p className="text-sm text-slate-600">
            Telefon: <strong>{customer.phone || "yok"}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openWa()}
              disabled={!customer.phone}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              style={{ background: "#15803d" }}
            >
              Boş mesaj aç
            </button>
            {templates.slice(0, 8).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={!customer.phone}
                onClick={() => openWa(tpl)}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 disabled:opacity-40"
                title={tpl.body}
              >
                {tpl.name.replace(/_/g, " ")}
              </button>
            ))}
            <Link href="/whatsapp/track" className="text-sm text-baykus-primary hover:underline self-center ml-auto">
              WhatsApp Takip →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
