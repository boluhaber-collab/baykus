"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PayableItem, apiFetch, formatMoney } from "@/lib/api";
import SupplierFisPanel from "@/components/SupplierFisPanel";

function SupplierPayablesInner() {
  const sp = useSearchParams();
  const openFis = sp.get("fis") === "1" || sp.get("pay") === "1";
  const preId = sp.get("supplier_id");

  const [items, setItems] = useState<PayableItem[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [fisOpen, setFisOpen] = useState(openFis);
  const [fisSupplierId, setFisSupplierId] = useState<number | null>(
    preId && Number(preId) ? Number(preId) : null,
  );
  const [embedded, setEmbedded] = useState(openFis);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await apiFetch<PayableItem[]>("/api/suppliers/payables"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openFis) {
      setFisOpen(true);
      setEmbedded(true);
    }
  }, [openFis]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter((i) =>
      [i.name, i.code, i.city, i.phone].join(" ").toLocaleLowerCase("tr").includes(needle),
    );
  }, [items, q]);

  const total = filtered.reduce((s, i) => s + Number(i.balance || 0), 0);

  function openFisFor(id?: number) {
    setFisSupplierId(id ?? null);
    setFisOpen(true);
    setEmbedded(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Açık Borçlar</h2>
          <p className="text-xs text-baykus-muted">
            Tedarik Merkezi › Borç / Alacak · fiş + ödeme kaydı
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/suppliers" className="bk-btn bk-btn-ghost text-xs">
            Tedarik Merkezi
          </Link>
          <Link href="/finance/open-balances" className="bk-btn bk-btn-ghost text-xs">
            Açık Bakiyeler
          </Link>
          <Link href="/purchases" className="bk-btn text-xs" style={{ background: "#0f766e", color: "#fff" }}>
            Alış belgesi
          </Link>
          <button
            type="button"
            className="bk-btn text-xs text-white"
            style={{ background: "#62c9aa" }}
            onClick={() => openFisFor()}
          >
            Borç-Alacak Fişi
          </button>
          <button type="button" className="bk-btn bk-btn-primary text-xs" onClick={load}>
            Yenile
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {embedded && fisOpen && (
        <SupplierFisPanel
          embedded
          open={fisOpen}
          initialSupplierId={fisSupplierId}
          payables={items}
          onSaved={load}
          onClose={() => {
            setFisOpen(false);
            setEmbedded(false);
          }}
        />
      )}
      {!embedded && fisOpen && (
        <SupplierFisPanel
          open={fisOpen}
          initialSupplierId={fisSupplierId}
          payables={items}
          onSaved={load}
          onClose={() => setFisOpen(false)}
        />
      )}

      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2">
          <div className="text-[11px] text-rose-800">Toplam açık borç</div>
          <div className="text-xl font-bold text-rose-900 tabular-nums">{formatMoney(total)}</div>
        </div>
        <div className="rounded border bg-white px-3 py-2">
          <div className="text-[11px] text-baykus-muted">Tedarikçi</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="rounded border bg-white px-3 py-2 flex items-end">
          <input
            className="bk-input"
            placeholder="Ara (ad, kod, şehir, tel)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="bk-table-wrap">
        <table className="bk-table">
          <thead>
            <tr>
              <th>Kod</th>
              <th>Tedarikçi</th>
              <th>Şehir</th>
              <th>Telefon</th>
              <th>Son hareket</th>
              <th className="text-right">Borç</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.supplier_id}>
                <td className="font-mono text-xs text-slate-500">{i.code || "—"}</td>
                <td className="font-medium">
                  <Link href={`/suppliers/${i.supplier_id}`} className="text-baykus-primary hover:underline">
                    {i.name}
                  </Link>
                </td>
                <td>{i.city || "—"}</td>
                <td>{i.phone || "—"}</td>
                <td className="text-xs text-slate-500">{i.last_movement_date || "—"}</td>
                <td className="text-right font-medium tabular-nums text-rose-700">
                  {formatMoney(Number(i.balance))}
                </td>
                <td className="text-right text-xs whitespace-nowrap space-x-2">
                  <button
                    type="button"
                    className="text-teal-700 hover:underline"
                    onClick={() => openFisFor(i.supplier_id)}
                  >
                    Fiş
                  </button>
                  <Link href={`/suppliers/${i.supplier_id}`} className="text-baykus-primary hover:underline">
                    Ekstre
                  </Link>
                  <Link href="/purchases/new" className="text-teal-700 hover:underline">
                    Alış
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-baykus-muted py-8">
                  Açık borç yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SupplierPayablesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-baykus-muted p-4">Yükleniyor…</p>}>
      <SupplierPayablesInner />
    </Suspense>
  );
}
