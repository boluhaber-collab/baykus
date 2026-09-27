"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Field,
  FilterBar,
  ReportHeader,
  ReportTable,
  SummaryCards,
  inputCls,
} from "@/components/reports/ReportChrome";
import StatusFooter from "@/components/StatusFooter";
import { Customer, apiFetch, downloadReportCsv, formatMoney } from "@/lib/api";

type PartyKind = "customer" | "supplier";

type SupplierRow = {
  id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
  city?: string | null;
  is_active?: boolean;
  balance?: number;
};

export default function CustomerListReportPage() {
  const [party, setParty] = useState<PartyKind>("customer");
  const [tipi, setTipi] = useState("all"); // UI only — schema yok
  const [sinif, setSinif] = useState("all"); // UI only
  const [durum, setDurum] = useState<"all" | "true" | "false">("all");
  const [bakiyeTarihi, setBakiyeTarihi] = useState("");
  const [sadeceBakiyeli, setSadeceBakiyeli] = useState(true);
  const [sadeceAktif, setSadeceAktif] = useState(true);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<
    { id: number; code?: string | null; name: string; phone?: string | null; city?: string | null; balance: number; is_active?: boolean }[]
  >([]);
  const [ran, setRan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (party === "customer") {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        const active = sadeceAktif ? "true" : durum !== "all" ? durum : "all";
        if (active !== "all") params.set("active", active);
        if (sadeceBakiyeli) params.set("has_balance", "true");
        const data = await apiFetch<Customer[]>(`/api/customers?${params}`);
        setRows(
          data.map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            phone: c.phone,
            city: c.city,
            balance: Number(c.balance ?? 0),
            is_active: c.is_active,
          })),
        );
      } else {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (sadeceAktif) params.set("active", "true");
        const data = await apiFetch<SupplierRow[]>(`/api/suppliers?${params}`);
        let mapped = data.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          phone: s.phone,
          city: s.city,
          balance: Number(s.balance ?? 0),
          is_active: s.is_active,
        }));
        if (sadeceBakiyeli) mapped = mapped.filter((r) => r.balance !== 0);
        if (durum === "true") mapped = mapped.filter((r) => r.is_active !== false);
        if (durum === "false") mapped = mapped.filter((r) => r.is_active === false);
        setRows(mapped);
      }
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rapor hatası");
    } finally {
      setLoading(false);
    }
  }, [party, q, durum, sadeceBakiyeli, sadeceAktif]);

  const stats = useMemo(() => {
    let pos = 0;
    let neg = 0;
    let withBal = 0;
    for (const r of rows) {
      if (r.balance > 0) {
        pos += r.balance;
        withBal += 1;
      } else if (r.balance < 0) {
        neg += r.balance;
        withBal += 1;
      }
    }
    return { count: rows.length, pos, neg, withBal };
  }, [rows]);

  return (
    <div>
      <ReportHeader
        title="Müşteri Listesi"
        subtitle="BizimHesap kriter formu — Tipi / sınıflandırma (şema yoksa bilgilendirme) · durum · bakiye"
        actions={
          <>
            <Link
              href="/reports/payables"
              className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm"
            >
              Tedarikçi borçları
            </Link>
            <button
              onClick={run}
              className="rounded-lg bg-teal-700 text-white px-4 py-2 text-sm font-bold"
              disabled={loading}
            >
              {loading ? "Hazırlanıyor…" : "Raporu Hazırla"}
            </button>
          </>
        }
      />

      <FilterBar>
        <Field label="Liste tipi">
          <select className={inputCls} value={party} onChange={(e) => setParty(e.target.value as PartyKind)}>
            <option value="customer">Müşteriler</option>
            <option value="supplier">Tedarikçiler</option>
          </select>
        </Field>
        <Field label="Tipi">
          <select className={inputCls} value={tipi} onChange={(e) => setTipi(e.target.value)}>
            <option value="all">Tümü</option>
            <option value="bireysel">Bireysel (UI)</option>
            <option value="kurumsal">Kurumsal (UI)</option>
          </select>
        </Field>
        <Field label="Sınıflandırma">
          <select className={inputCls} value={sinif} onChange={(e) => setSinif(e.target.value)}>
            <option value="all">Tümü</option>
            <option value="a">A (UI)</option>
            <option value="b">B (UI)</option>
            <option value="c">C (UI)</option>
          </select>
        </Field>
        <Field label="Durum">
          <select
            className={inputCls}
            value={durum}
            onChange={(e) => setDurum(e.target.value as "all" | "true" | "false")}
          >
            <option value="all">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </Field>
        <Field label="Bakiye tarihi">
          <input
            type="date"
            className={inputCls}
            value={bakiyeTarihi}
            onChange={(e) => setBakiyeTarihi(e.target.value)}
            title="Baykuş’ta tarihsel bakiye kesiti henüz yok; güncel bakiye kullanılır"
          />
        </Field>
        <Field label="Ara">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad / kod / telefon" />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-600 pb-2">
          <input type="checkbox" checked={sadeceBakiyeli} onChange={(e) => setSadeceBakiyeli(e.target.checked)} />
          Sadece bakiyesi olanlar
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600 pb-2">
          <input type="checkbox" checked={sadeceAktif} onChange={(e) => setSadeceAktif(e.target.checked)} />
          Sadece aktifler
        </label>
      </FilterBar>

      <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        Tipi / sınıflandırma alanları BizimHesap UI paritesi içindir; Baykuş müşteri şemasında henüz yok — filtre uygulanmaz.
        {bakiyeTarihi ? " Bakiye tarihi seçildi; rapor yine güncel bakiyeyi gösterir (tarihsel kesit OOS)." : ""}
      </div>

      {error && <div className="mb-3 rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {ran && (
        <>
          <SummaryCards
            items={[
              { label: "Kayıt", value: stats.count, color: "#0f766e" },
              { label: "Bakiyeli", value: stats.withBal, color: "#2563eb" },
              { label: "Alacak (+)", value: formatMoney(stats.pos), color: "#b45309" },
              { label: "Borç (−)", value: formatMoney(stats.neg), color: "#be123c" },
            ]}
          />
          <div className="mb-2 flex gap-2 print:hidden">
            <button
              className="rounded bg-slate-700 text-white px-3 py-1.5 text-xs font-bold"
              onClick={async () => {
                try {
                  const params = new URLSearchParams();
                  if (party === "customer") {
                    if (q.trim()) params.set("q", q.trim());
                    if (sadeceAktif) params.set("active", "true");
                    if (sadeceBakiyeli) params.set("has_balance", "true");
                    await downloadReportCsv(
                      `/api/reports/receivables?${params}`,
                      "musteri_listesi.csv",
                    );
                  } else {
                    await downloadReportCsv("/api/reports/payables", "tedarikci_listesi.csv");
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : "CSV hatası");
                }
              }}
            >
              CSV indir
            </button>
            <button className="rounded bg-slate-500 text-white px-3 py-1.5 text-xs font-bold" onClick={() => window.print()}>
              Yazdır
            </button>
          </div>
          <ReportTable
            headers={["Kod", "Ad", "Şehir", "Telefon", "Durum", "Bakiye"]}
            colSpan={6}
            empty={rows.length === 0}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code || "—"}</td>
                <td>
                  <Link
                    href={party === "customer" ? `/customers/${r.id}` : `/suppliers/${r.id}`}
                    className="text-baykus-primary hover:underline font-medium"
                  >
                    {r.name}
                  </Link>
                </td>
                <td>{r.city || "—"}</td>
                <td>{r.phone || "—"}</td>
                <td>{r.is_active === false ? "Pasif" : "Aktif"}</td>
                <td className="text-right tabular-nums">{formatMoney(r.balance)}</td>
              </tr>
            ))}
          </ReportTable>
        </>
      )}

      {!ran && !loading && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          Kriterleri seçip <b>Raporu Hazırla</b> düğmesine basın.
        </div>
      )}

      <StatusFooter />
    </div>
  );
}
