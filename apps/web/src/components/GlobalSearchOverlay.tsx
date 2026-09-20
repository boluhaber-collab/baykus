"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type SearchResult = {
  tur: string;
  no_kod: string;
  ad: string;
  iliski: string;
  detay: string;
  href: string;
};

type SearchResponse = { query: string; count: number; results: SearchResult[] };

const TUR_STYLE: Record<string, string> = {
  Müşteri: "bg-blue-50 text-blue-800",
  Sipariş: "bg-emerald-50 text-emerald-800",
  Teklif: "bg-violet-50 text-violet-800",
  Ürün: "bg-sky-50 text-sky-800",
  Tedarikçi: "bg-slate-100 text-slate-700",
};

export function openGlobalSearch(initial = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("baykus:open-search", { detail: { q: initial } }));
}

export default function GlobalSearchOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setError("");
    setActive(0);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2 && trimmed.replace(/\D/g, "").length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<SearchResponse>(
        `/api/search?q=${encodeURIComponent(trimmed)}&limit=40`,
      );
      setResults(res.results || []);
      setActive(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arama hatası");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { q?: string } | undefined;
      setOpen(true);
      const initial = detail?.q || "";
      setQ(initial);
      if (initial) void runSearch(initial);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    window.addEventListener("baykus:open-search", onOpen as EventListener);
    return () => window.removeEventListener("baykus:open-search", onOpen as EventListener);
  }, [runSearch]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  function onChange(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runSearch(value), 220);
  }

  function select(item: SearchResult) {
    close();
    router.push(item.href);
  }

  const hint = useMemo(() => {
    if (!q.trim()) return "Müşteri / telefon / sipariş no / ürün / tedarikçi";
    if (loading) return "Aranıyor…";
    return `${results.length} sonuç`;
  }, [q, loading, results.length]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 px-3 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Akıllı Arama"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        data-baykus-escape-ignore
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
          <span className="text-slate-400 text-sm">⌘K</span>
          <input
            ref={inputRef}
            className="flex-1 text-base outline-none placeholder:text-slate-400"
            placeholder="Akıllı Arama…"
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = results[active];
                if (item) select(item);
              }
            }}
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">{hint}</span>
          <button type="button" className="text-xs text-slate-500 hover:text-slate-800 px-2" onClick={close}>
            Esc
          </button>
        </div>
        {error && <div className="px-3 py-2 text-sm text-red-600 bg-red-50">{error}</div>}
        <div className="max-h-[55vh] overflow-auto">
          {results.length === 0 && q.trim().length >= 2 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Sonuç yok — aranan kayıt bulunamadı.</div>
          )}
          <table className="w-full text-sm">
            <tbody>
              {results.map((r, idx) => (
                <tr
                  key={`${r.tur}-${r.no_kod}-${r.href}-${idx}`}
                  className={`cursor-pointer border-b border-slate-50 ${
                    idx === active ? "bg-sky-50" : "hover:bg-slate-50"
                  }`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => select(r)}
                >
                  <td className="px-3 py-2 w-28">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TUR_STYLE[r.tur] || "bg-slate-100"}`}>
                      {r.tur}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{r.no_kod}</td>
                  <td className="px-2 py-2 font-medium text-slate-800">{r.ad}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">{r.iliski}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[280px]">{r.detay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
          <span>↑↓ seç · Enter aç · Esc kapat</span>
          <span>Ctrl+K veya /</span>
        </div>
      </div>
    </div>
  );
}
