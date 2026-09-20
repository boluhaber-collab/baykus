"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { OrderListItem, apiFetch, downloadAuthFile, downloadPdf } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  category: string | null;
  archive_tag: string | null;
  original_filename: string;
  content_type?: string | null;
  size_bytes: number;
  created_at: string | null;
};

type Tab = "docs" | "orders";

export default function ArchiveCenterPage() {
  const [tab, setTab] = useState<Tab>("docs");
  const [items, setItems] = useState<Doc[]>([]);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [pdfOnly, setPdfOnly] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadDocs = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (tag.trim()) params.set("archive_tag", tag.trim());
      if (q.trim()) params.set("q", q.trim());
      setItems(await apiFetch<Doc[]>(`/api/documents?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    }
  }, [tag, q]);

  const loadOrders = useCallback(async () => {
    setError("");
    try {
      setOrders(await apiFetch<OrderListItem[]>("/api/orders?limit=100"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sipariş yükleme hatası");
    }
  }, []);

  useEffect(() => {
    if (tab === "docs") void loadDocs();
    else void loadOrders();
  }, [tab, loadDocs, loadOrders]);

  const docs = useMemo(() => {
    if (!pdfOnly) return items;
    return items.filter((d) => {
      const name = (d.original_filename || "").toLowerCase();
      const ct = (d.content_type || "").toLowerCase();
      return name.endsWith(".pdf") || ct.includes("pdf");
    });
  }, [items, pdfOnly]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Dosya seçin");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim() || file.name);
    fd.append("category", "Arşiv");
    fd.append("archive_tag", tag.trim() || "arsiv");
    try {
      await apiFetch("/api/documents", { method: "POST", body: fd });
      setTitle("");
      setFile(null);
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme hatası");
    }
  }

  async function remove(id: number) {
    if (!confirm("Arşivden silinsin mi?")) return;
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme hatası");
    }
  }

  async function orderPdf(o: OrderListItem) {
    setBusyId(o.id);
    try {
      await downloadPdf(`/api/orders/${o.id}/work-order-pdf`, `${o.order_number}-is-emri.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF hatası");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Belge Arşiv Merkezi</h2>
          <p className="text-xs text-baykus-muted">
            Yüklenen PDF + sipariş iş emri PDF ·{" "}
            <Link href="/documents" className="text-baykus-primary hover:underline">
              Evrak Dolabı
            </Link>
          </p>
        </div>
        <div className="flex gap-1 rounded border bg-white p-0.5 text-xs">
          <button
            type="button"
            className={`px-3 py-1.5 rounded ${tab === "docs" ? "bg-slate-800 text-white" : ""}`}
            onClick={() => setTab("docs")}
          >
            Belgeler ({docs.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded ${tab === "orders" ? "bg-slate-800 text-white" : ""}`}
            onClick={() => setTab("orders")}
          >
            Sipariş PDF
          </button>
        </div>
      </div>

      {error && <div className="rounded bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {tab === "docs" && (
        <>
          <form onSubmit={upload} className="bk-card p-3 grid md:grid-cols-4 gap-2 text-sm">
            <input className="bk-input" placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input
              className="bk-input"
              placeholder="Arşiv etiketi (boş = tümü)"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <input type="file" accept=".pdf,image/*,.png,.jpg,.jpeg" className="bk-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button type="submit" className="bk-btn bk-btn-primary">
              Arşive ekle
            </button>
          </form>

          <div className="bk-filter-bar">
            <input className="bk-input max-w-[200px]" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={pdfOnly} onChange={(e) => setPdfOnly(e.target.checked)} />
              Sadece PDF
            </label>
            <button type="button" className="bk-btn bk-btn-ghost text-xs" onClick={loadDocs}>
              Tara / Yenile
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            <div className="bk-card px-3 py-2">
              <div className="text-[11px] text-baykus-muted">Belge</div>
              <div className="text-xl font-bold">{docs.length}</div>
            </div>
            <div className="bk-card px-3 py-2">
              <div className="text-[11px] text-baykus-muted">PDF</div>
              <div className="text-xl font-bold">
                {items.filter((d) => (d.original_filename || "").toLowerCase().endsWith(".pdf")).length}
              </div>
            </div>
            <div className="bk-card px-3 py-2">
              <div className="text-[11px] text-baykus-muted">Toplam boyut</div>
              <div className="text-xl font-bold">
                {(docs.reduce((s, d) => s + (d.size_bytes || 0), 0) / 1024).toFixed(0)} KB
              </div>
            </div>
          </div>

          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Başlık</th>
                  <th>Etiket</th>
                  <th>Dosya</th>
                  <th>Boyut</th>
                  <th>Tarih</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.title}</td>
                    <td>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px]">
                        {d.archive_tag || d.category || "—"}
                      </span>
                    </td>
                    <td className="text-xs">{d.original_filename}</td>
                    <td className="text-xs tabular-nums">{((d.size_bytes || 0) / 1024).toFixed(1)} KB</td>
                    <td className="text-xs">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString("tr-TR") : "—"}
                    </td>
                    <td className="text-right space-x-2 text-xs whitespace-nowrap">
                      <button
                        type="button"
                        className="text-baykus-primary hover:underline"
                        onClick={() => downloadAuthFile(`/api/documents/${d.id}/download`, d.original_filename)}
                      >
                        İndir
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => remove(d.id)}>
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
                {docs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-baykus-muted py-8">
                      Arşiv boş — PDF yükleyin veya etiketi temizleyip tarayın
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "orders" && (
        <>
          <p className="text-xs text-baykus-muted">
            Son siparişlerden iş emri PDF indirin (canlı üretilir).
          </p>
          <div className="bk-table-wrap">
            <table className="bk-table">
              <thead>
                <tr>
                  <th>Sipariş</th>
                  <th>Müşteri</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">
                      <Link href={`/orders/${o.id}`} className="text-baykus-primary hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td>{o.customer_name || "—"}</td>
                    <td className="text-xs">{o.status}</td>
                    <td className="text-xs">{o.created_at ? String(o.created_at).slice(0, 10) : "—"}</td>
                    <td className="text-right text-xs space-x-2">
                      <button
                        type="button"
                        className="text-violet-700 hover:underline"
                        disabled={busyId === o.id}
                        onClick={() => void orderPdf(o)}
                      >
                        {busyId === o.id ? "…" : "İş Emri PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-baykus-muted py-8">
                      Sipariş yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
