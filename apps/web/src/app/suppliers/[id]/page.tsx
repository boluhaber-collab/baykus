"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BankAccount,
  SUPPLIER_MOVEMENT_LABELS,
  SupplierDetail,
  SupplierStatement,
  apiFetch,
  formatMoney,
} from "@/lib/api";
import StatusFooter from "@/components/StatusFooter";
import ExpandableMovementTable, {
  linesFromPurchase,
} from "@/components/ExpandableMovementTable";
import PartyCardLayout, { partySmsHref } from "@/components/PartyCardLayout";
import type {
  PurchaseDetail,
  SupplierMovement,
  SupplierPurchaseBrief,
} from "@/lib/api";

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [statement, setStatement] = useState<SupplierStatement | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [busy, setBusy] = useState(false);

  const [payType, setPayType] = useState<"payment" | "adjustment" | "purchase">("payment");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [paySide, setPaySide] = useState<"debit" | "credit">("credit");
  const [postFinance, setPostFinance] = useState(false);
  const [financeMethod, setFinanceMethod] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState("");

  const [editForm, setEditForm] = useState({
    code: "",
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    tax_number: "",
    tax_office: "",
    notes: "",
    is_active: true,
    opening_balance: "0",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [detail, stmt, bankList] = await Promise.all([
        apiFetch<SupplierDetail>(`/api/suppliers/${id}`),
        apiFetch<SupplierStatement>(`/api/suppliers/${id}/statement`),
        apiFetch<BankAccount[]>("/api/finance/banks").catch(() => [] as BankAccount[]),
      ]);
      setSupplier(detail);
      setStatement(stmt);
      setBanks(bankList.filter((b) => b.is_active !== false));
      setEditForm({
        code: detail.code || "",
        name: detail.name || "",
        email: detail.email || "",
        phone: detail.phone || "",
        city: detail.city || "",
        address: detail.address || "",
        tax_number: detail.tax_number || "",
        tax_office: detail.tax_office || "",
        notes: detail.notes || "",
        is_active: detail.is_active !== false,
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
      await apiFetch(`/api/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: editForm.code.trim() || null,
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || null,
          city: editForm.city.trim() || null,
          address: editForm.address.trim() || null,
          tax_number: editForm.tax_number.trim() || null,
          tax_office: editForm.tax_office.trim() || null,
          notes: editForm.notes.trim() || null,
          is_active: editForm.is_active,
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
      if (payType === "payment" && postFinance) {
        body.post_to_finance = true;
        body.finance_method = financeMethod;
        if (financeMethod === "bank") body.bank_account_id = Number(bankId);
      }
      await apiFetch(`/api/suppliers/${id}/movements`, {
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
    if (!confirm("Tedarikçiyi silmek istiyor musunuz?")) return;
    try {
      await apiFetch(`/api/suppliers/${id}`, { method: "DELETE" });
      router.push("/suppliers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  const payments = useMemo(() => {
    const moves = statement?.movements || [];
    return moves.filter(
      (m) =>
        m.movement_type === "payment" ||
        m.movement_type === "adjustment" ||
        (Number(m.credit) > 0 && !m.purchase_id),
    );
  }, [statement]);

  if (!supplier && !error) {
    return <div className="text-slate-500">Yükleniyor…</div>;
  }
  if (!supplier) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/suppliers" className="text-baykus-600 hover:underline">
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const bal = Number(supplier.balance ?? 0);
  const smsHref = partySmsHref(supplier.phone);
  const addressLine = [supplier.address, supplier.city].filter(Boolean).join(" · ");
  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  function scrollPay() {
    setShowSecondary(true);
    setTimeout(() => {
      document.getElementById("supplier-pay-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function scrollEkstre() {
    document.getElementById("supplier-ekstre")?.scrollIntoView({ behavior: "smooth" });
  }

  const purchasesPanel = (
    <ExpandableMovementTable<SupplierPurchaseBrief>
      rows={(supplier.recent_purchases || []).slice(0, 12)}
      emptyText="Alış kaydı yok"
      getCta={(p) => ({ href: `/purchases/${p.id}`, label: "Alış ekranına git" })}
      loadDetail={async (p) => {
        const purchase = await apiFetch<PurchaseDetail>(`/api/purchases/${p.id}`);
        return linesFromPurchase(purchase);
      }}
      columns={[
        {
          key: "date",
          header: "Tarih",
          render: (p) => <span className="whitespace-nowrap">{p.purchase_date}</span>,
        },
        {
          key: "no",
          header: "No",
          render: (p) => (
            <Link href={`/purchases/${p.id}`} className="text-baykus-700 hover:underline">
              {p.purchase_number}
            </Link>
          ),
        },
        {
          key: "status",
          header: "Durum",
          className: "text-red-700",
          render: (p) => p.status,
        },
        {
          key: "tutar",
          header: "Tutar",
          align: "right",
          render: (p) => formatMoney(Number(p.total_amount)),
        },
      ]}
    />
  );

  const paymentsPanel = (
    <ExpandableMovementTable<SupplierMovement>
      rows={payments.slice(0, 12)}
      emptyText="Ödeme yok"
      getNote={(m) => m.note}
      getCta={(m) =>
        m.purchase_id ? { href: `/purchases/${m.purchase_id}`, label: "Alış ekranına git" } : null
      }
      loadDetail={async (m) => {
        if (!m.purchase_id) return { lines: [], note: m.note || null };
        const purchase = await apiFetch<PurchaseDetail>(`/api/purchases/${m.purchase_id}`);
        const detail = linesFromPurchase(purchase);
        return { lines: detail.lines, note: m.note || detail.note || null };
      }}
      columns={[
        {
          key: "date",
          header: "Tarih",
          render: (m) => <span className="whitespace-nowrap">{m.movement_date}</span>,
        },
        {
          key: "tutar",
          header: "Tutar",
          align: "right",
          render: (m) =>
            formatMoney(Number(m.credit) > 0 ? Number(m.credit) : Number(m.debit)),
        },
        {
          key: "sekli",
          header: "Şekli",
          render: (m) => SUPPLIER_MOVEMENT_LABELS[m.movement_type] || m.movement_type,
        },
      ]}
    />
  );

  const returnsPanel = (
    <ExpandableMovementTable<{ id: number }>
      rows={[]}
      emptyText="İade kaydı yok"
      columns={[
        { key: "date", header: "Tarih", render: () => "—" },
        { key: "no", header: "No", render: () => "—" },
        { key: "status", header: "Durum", render: () => "—" },
        { key: "tutar", header: "Tutar", align: "right", render: () => "—" },
      ]}
    />
  );

  return (
    <>
      <PartyCardLayout
        role="supplier"
        breadcrumbHref="/suppliers"
        breadcrumbLabel="Tedarik Merkezi"
        title={supplier.name}
        contactPerson={null}
        phone={supplier.phone}
        address={addressLine || null}
        notes={supplier.notes}
        openBalance={bal}
        openBalanceSub={
          bal > 0 ? "tedarikçiye borç" : bal < 0 ? "tedarikçiden alacak" : "hesap kapalı"
        }
        error={error}
        actions={[
          {
            key: "alis",
            label: "Alış Yap",
            icon: "🛒",
            variant: "navy",
            menu: [
              { label: "Yeni alış", href: `/purchases/new?supplier_id=${id}` },
              { label: "Alış listesi", href: "/purchases" },
            ],
          },
          {
            key: "odeme",
            label: "Ödeme/Tahsilat",
            icon: "💵",
            variant: "green",
            onClick: () => {
              setPayType("payment");
              setPayAmount(bal > 0 ? String(bal) : "");
              scrollPay();
            },
            menu: [
              {
                label: "Ödeme kaydet",
                onClick: () => {
                  setPayType("payment");
                  scrollPay();
                },
              },
              {
                label: "Düzeltme",
                onClick: () => {
                  setPayType("adjustment");
                  scrollPay();
                },
              },
              { label: "Borç-Alacak Fişi", href: `/suppliers/payables?fis=1&supplier_id=${id}` },
            ],
          },
          {
            key: "ekstre",
            label: "Hesap Ekstresi",
            icon: "📑",
            variant: "white",
            onClick: scrollEkstre,
          },
          {
            key: "sms",
            label: "SMS",
            icon: "💬",
            variant: "purple",
            href: smsHref || undefined,
            onClick: smsHref
              ? undefined
              : () => setError("Telefon yok — SMS/WhatsApp açılamaz"),
          },
          {
            key: "docs",
            label: "Dökümanlar",
            icon: "📁",
            variant: "cyan",
            href: "/documents",
          },
          {
            key: "diger",
            label: "Diğer",
            icon: "⚙️",
            variant: "yellow",
            menu: [
              {
                label: editing ? "Düzenlemeyi kapat" : "Kartı Düzenle",
                onClick: () => {
                  setEditing((v) => !v);
                  setShowSecondary(true);
                },
              },
              {
                label: showSecondary ? "Detay panellerini gizle" : "Ödeme formu / ekstre",
                onClick: () => setShowSecondary((v) => !v),
              },
              { label: "Borç listesi", href: "/suppliers/payables" },
              { label: "Sil", onClick: () => void onDelete() },
            ],
          },
        ]}
        leftPanels={[
          {
            key: "alislar",
            title: "Önceki Ürün/Hizmet Alışları",
            footerHref: "/purchases",
            footerLabel: "tamamı için tıklayın...",
            children: purchasesPanel,
          },
        ]}
        rightPanels={[
          {
            key: "odemeler",
            title: "Önceki Ödemeler",
            footerLabel: "tamamı için tıklayın...",
            footerOnClick: () => {
              setShowSecondary(true);
              setTimeout(scrollEkstre, 50);
            },
            children: paymentsPanel,
          },
          {
            key: "iadeler",
            title: "Verdiğiniz İadeler",
            note: "İade modülü henüz yok — panel boş durum gösterir (sahte veri yok).",
            children: returnsPanel,
          },
        ]}
      >
        {(showSecondary || editing) && (
          <div className="space-y-4 mt-2">
            {editing && (
              <form
                onSubmit={saveEdit}
                data-baykus-save
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
              >
                <h2 className="font-semibold text-slate-800">Kartı düzenle</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(
                    [
                      ["code", "Kod"],
                      ["name", "Ünvan"],
                      ["email", "E-posta"],
                      ["phone", "Telefon"],
                      ["city", "Şehir"],
                      ["tax_number", "Vergi No"],
                      ["tax_office", "Vergi Dairesi"],
                      ["opening_balance", "Açılış bakiyesi"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        className={input}
                        value={editForm[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        required={key === "name"}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      id="edit-active"
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    <label htmlFor="edit-active" className="text-sm">
                      Aktif
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Adres</label>
                  <textarea
                    rows={2}
                    className={input}
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notlar</label>
                  <textarea
                    rows={2}
                    className={input}
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
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

            <div className="grid lg:grid-cols-2 gap-6">
              <form
                id="supplier-pay-form"
                onSubmit={addMovement}
                data-baykus-save
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
              >
                <h2 className="font-semibold text-slate-800">Ödeme / hareket</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tip</label>
                    <select
                      className={input}
                      value={payType}
                      onChange={(e) => setPayType(e.target.value as typeof payType)}
                    >
                      <option value="payment">Ödeme</option>
                      <option value="adjustment">Düzeltme</option>
                      <option value="purchase">Satın alma (manuel)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Tutar</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
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
                  {payType === "adjustment" && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Yön</label>
                      <select
                        className={input}
                        value={paySide}
                        onChange={(e) => setPaySide(e.target.value as "debit" | "credit")}
                      >
                        <option value="debit">Borç artır</option>
                        <option value="credit">Borç azalt</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Not</label>
                  <input
                    className={input}
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                  />
                </div>
                {payType === "payment" && (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={postFinance}
                        onChange={(e) => setPostFinance(e.target.checked)}
                      />
                      Kasaya / bankaya da kaydet
                    </label>
                    {postFinance && (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <select
                          className={input}
                          value={financeMethod}
                          onChange={(e) => setFinanceMethod(e.target.value as "cash" | "bank")}
                        >
                          <option value="cash">Kasa</option>
                          <option value="bank">Banka</option>
                        </select>
                        {financeMethod === "bank" && (
                          <select
                            className={input}
                            required
                            value={bankId}
                            onChange={(e) => setBankId(e.target.value)}
                          >
                            <option value="">Hesap seçin</option>
                            {banks.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-60"
                >
                  Kaydet
                </button>
              </form>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm grid sm:grid-cols-2 gap-2 content-start">
                <div>
                  <span className="text-slate-500">Telefon:</span> {supplier.phone || "—"}
                </div>
                <div>
                  <span className="text-slate-500">E-posta:</span> {supplier.email || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Vergi No:</span> {supplier.tax_number || "—"}
                </div>
                <div>
                  <span className="text-slate-500">Vergi Dairesi:</span>{" "}
                  {supplier.tax_office || "—"}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">Adres:</span> {supplier.address || "—"}
                </div>
                <div className="sm:col-span-2 text-xs text-slate-400">
                  Açılış: {formatMoney(Number(supplier.opening_balance ?? 0))}
                  {supplier.is_active === false ? " · Pasif" : ""}
                </div>
              </div>
            </div>

            <div
              id="supplier-ekstre"
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Hesap Ekstresi / Hareketler</h2>
                {statement && (
                  <div className="text-xs text-slate-500">
                    Açılış {formatMoney(Number(statement.opening_balance))} · Kapanış{" "}
                    <span className="font-medium text-slate-800">
                      {formatMoney(Number(statement.closing_balance))}
                    </span>
                  </div>
                )}
              </div>
              <ExpandableMovementTable<SupplierMovement>
                rows={statement?.movements || []}
                emptyText="Hareket yok"
                getNote={(m) => m.note}
                getCta={(m) =>
                  m.purchase_id
                    ? { href: `/purchases/${m.purchase_id}`, label: "Alış ekranına git" }
                    : null
                }
                loadDetail={async (m) => {
                  if (!m.purchase_id) return { lines: [], note: m.note || null };
                  const purchase = await apiFetch<PurchaseDetail>(
                    `/api/purchases/${m.purchase_id}`,
                  );
                  const detail = linesFromPurchase(purchase);
                  return { lines: detail.lines, note: m.note || detail.note || null };
                }}
                columns={[
                  {
                    key: "date",
                    header: "Tarih",
                    render: (m) => (
                      <span className="whitespace-nowrap">{m.movement_date}</span>
                    ),
                  },
                  {
                    key: "type",
                    header: "Tip",
                    render: (m) =>
                      SUPPLIER_MOVEMENT_LABELS[m.movement_type] || m.movement_type,
                  },
                  {
                    key: "doc",
                    header: "Belge",
                    render: (m) =>
                      m.purchase_id ? (
                        <Link
                          href={`/purchases/${m.purchase_id}`}
                          className="text-baykus-600 hover:underline"
                        >
                          {m.purchase_number || `#${m.purchase_id}`}
                        </Link>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    key: "note",
                    header: "Not",
                    className: "text-slate-500",
                    render: (m) => m.note || "—",
                  },
                  {
                    key: "debit",
                    header: "Borç",
                    align: "right",
                    render: (m) =>
                      Number(m.debit) > 0 ? formatMoney(Number(m.debit)) : "—",
                  },
                  {
                    key: "credit",
                    header: "Alacak",
                    align: "right",
                    render: (m) =>
                      Number(m.credit) > 0 ? formatMoney(Number(m.credit)) : "—",
                  },
                  {
                    key: "bal",
                    header: "Bakiye",
                    align: "right",
                    className: "font-medium",
                    render: (m) =>
                      m.running_balance != null
                        ? formatMoney(Number(m.running_balance))
                        : "—",
                  },
                ]}
              />
            </div>
          </div>
        )}
      </PartyCardLayout>
      <StatusFooter onRefresh={load} />
    </>
  );
}
