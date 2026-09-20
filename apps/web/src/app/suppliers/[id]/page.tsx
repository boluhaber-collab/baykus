"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  BankAccount,
  SUPPLIER_MOVEMENT_LABELS,
  SupplierDetail,
  SupplierStatement,
  apiFetch,
  formatMoney,
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
  const moves = statement?.movements || [];
  const toplamBorc =
    Number(statement?.opening_balance ?? supplier.opening_balance ?? 0) +
    moves.reduce((s, m) => s + Number(m.debit || 0), 0);
  const toplamOdeme = moves.reduce((s, m) => s + Number(m.credit || 0), 0);
  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-baykus-500";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-baykus-muted mb-1">
            <Link href="/suppliers" className="text-baykus-primary hover:underline">Tedarik Merkezi</Link>
            <span className="mx-1">›</span>
            <span className="font-medium">{supplier.name}</span>
          </div>
          <div className="rounded-xl border border-[#e5d7b8] bg-[#f4ead5] px-4 py-3 mt-1">
            <h1 className="text-xl font-bold text-slate-700">{supplier.name}</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {[supplier.code, supplier.phone, supplier.city, supplier.address]
                .filter(Boolean)
                .join("  |  ") || "Tedarikçi bilgisi kaydedilmemiş."}
              {supplier.is_active === false ? " · Pasif" : ""}
            </p>
          </div>
        </div>
        <div className="rounded-xl border-4 border-slate-500 bg-[#fffde7] px-4 py-3 max-w-md text-sm text-emerald-600 min-w-[200px]">
          {(supplier.notes || "").trim() || "Bu tedarikçi için özel not bulunmuyor."}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#e68778" }}>
          <div className="text-[11px] font-bold text-center">Açık Bakiye</div>
          <div className="text-xl font-bold tabular-nums text-center">{formatMoney(bal)}</div>
          <div className="text-[10px] text-center opacity-90">
            {bal > 0 ? "tedarikçiye borç" : bal < 0 ? "tedarikçiden alacak" : "hesap kapalı"}
          </div>
        </div>
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#7fb5df" }}>
          <div className="text-[11px] font-bold text-center">Toplam Borç</div>
          <div className="text-xl font-bold tabular-nums text-center">{formatMoney(toplamBorc)}</div>
        </div>
        <div className="rounded-xl text-white p-3 shadow-sm" style={{ background: "#8bd0a7" }}>
          <div className="text-[11px] font-bold text-center">Toplam Ödeme / Mahsup</div>
          <div className="text-xl font-bold tabular-nums text-center">{formatMoney(toplamOdeme)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/purchases/new?supplier_id=${id}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#334155" }}
        >
          Alış Yap
        </Link>
        <button
          type="button"
          onClick={() => {
            setPayType("payment");
            setPayAmount(bal > 0 ? String(bal) : "");
            document.getElementById("supplier-pay-form")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#198754" }}
        >
          Ödeme / Tahsilat
        </button>
        <a
          href="#supplier-ekstre"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          Hesap Ekstresi
        </a>
        <Link
          href={`/suppliers/payables?fis=1&supplier_id=${id}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#7c3aed" }}
        >
          Borç-Alacak Fişi
        </Link>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ background: "#7fb5df" }}
        >
          {editing ? "Düzenlemeyi kapat" : "Kartı Düzenle"}
        </button>
        <button onClick={onDelete} className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-sm">
          Sil
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm grid sm:grid-cols-2 gap-2">
        <div><span className="text-slate-500">Telefon:</span> {supplier.phone || "—"}</div>
        <div><span className="text-slate-500">E-posta:</span> {supplier.email || "—"}</div>
        <div><span className="text-slate-500">Vergi No:</span> {supplier.tax_number || "—"}</div>
        <div><span className="text-slate-500">Vergi Dairesi:</span> {supplier.tax_office || "—"}</div>
        <div className="sm:col-span-2"><span className="text-slate-500">Adres:</span> {supplier.address || "—"}</div>
        <div className="sm:col-span-2 text-xs text-slate-400">
          Açılış: {formatMoney(Number(supplier.opening_balance ?? 0))}
        </div>
      </div>

      {editing && (
        <form onSubmit={saveEdit} data-baykus-save className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
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
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-baykus-600 text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            Kaydet
          </button>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <form id="supplier-pay-form" onSubmit={addMovement} data-baykus-save className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
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
              <input type="date" className={input} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
            <input className={input} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          {payType === "payment" && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={postFinance} onChange={(e) => setPostFinance(e.target.checked)} />
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

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Son satın almalar</h2>
          <ul className="space-y-2 text-sm">
            {(supplier.recent_purchases || []).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                <Link href={`/purchases/${p.id}`} className="text-baykus-700 hover:underline">
                  {p.purchase_number}
                </Link>
                <span className="text-slate-500">{p.status}</span>
                <span className="tabular-nums font-medium">{formatMoney(Number(p.total_amount))}</span>
              </li>
            ))}
            {(supplier.recent_purchases || []).length === 0 && (
              <li className="text-slate-400">Kayıt yok</li>
            )}
          </ul>
        </div>
      </div>

      <div id="supplier-ekstre" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Hesap Ekstresi</h2>
          {statement && (
            <div className="text-xs text-slate-500">
              Açılış {formatMoney(Number(statement.opening_balance))} · Kapanış{" "}
              <span className="font-medium text-slate-800">
                {formatMoney(Number(statement.closing_balance))}
              </span>
            </div>
          )}
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">Tarih</th>
              <th className="px-4 py-2">Tip</th>
              <th className="px-4 py-2">Belge</th>
              <th className="px-4 py-2">Not</th>
              <th className="px-4 py-2 text-right">Borç</th>
              <th className="px-4 py-2 text-right">Alacak</th>
              <th className="px-4 py-2 text-right">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {(statement?.movements || []).map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-2 whitespace-nowrap">{m.movement_date}</td>
                <td className="px-4 py-2">{SUPPLIER_MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
                <td className="px-4 py-2">
                  {m.purchase_id ? (
                    <Link href={`/purchases/${m.purchase_id}`} className="text-baykus-600 hover:underline">
                      {m.purchase_number || `#${m.purchase_id}`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{m.note || "—"}</td>
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
            {(statement?.movements || []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Hareket yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
