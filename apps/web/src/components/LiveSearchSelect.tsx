"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Customer, Product, Supplier, apiFetch } from "@/lib/api";
import { displayCode, productOptionLabel } from "@/lib/productLabel";

export type LiveSearchOption = {
  value: string;
  label: string;
  hint?: string;
  keywords?: string;
};

type Props = {
  value: string;
  onChange: (value: string, option: LiveSearchOption | null) => void;
  options: LiveSearchOption[];
  /** Server lookup merged into the open dropdown (local matches still show immediately). */
  fetchMatches?: (query: string) => Promise<LiveSearchOption[]>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** After a pick, clear the field (quick-add / barcode). */
  clearOnSelect?: boolean;
  className?: string;
  inputClassName?: string;
  max?: number;
  emptyText?: string;
  id?: string;
};

function norm(s: string): string {
  return s.toLocaleLowerCase("tr-TR");
}

function haystack(o: LiveSearchOption): string {
  return norm([o.label, o.hint, o.keywords].filter(Boolean).join(" "));
}

function rank(o: LiveSearchOption, needle: string): number {
  const label = norm(o.label);
  const tokens = norm(o.keywords || o.label)
    .split(/[\s,/|·—-]+/)
    .filter(Boolean);
  if (label === needle || tokens.includes(needle)) return 0;
  if (label.startsWith(needle) || tokens.some((t) => t.startsWith(needle))) return 1;
  return 2;
}

function mergeById<T extends { id: number }>(prev: T[], rows: T[]): T[] {
  if (!rows.length) return prev;
  const ids = new Set(prev.map((p) => p.id));
  const add = rows.filter((r) => !ids.has(r.id));
  return add.length ? [...prev, ...add] : prev;
}

export function customerToOption(c: {
  id: number;
  name: string;
  company?: string | null;
  phone?: string | null;
  code?: string | null;
  email?: string | null;
}): LiveSearchOption {
  const hint = [c.phone, c.company].filter(Boolean).join(" · ");
  return {
    value: String(c.id),
    label: c.name,
    hint: hint || undefined,
    keywords: [c.name, c.company, c.phone, c.code, c.email].filter(Boolean).join(" "),
  };
}

export function productToOption(p: {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  brand?: string | null;
  stock_qty?: number | null;
  total_stock?: number | null;
}): LiveSearchOption {
  const stock = p.total_stock ?? p.stock_qty;
  const hint = [p.category, stock != null ? `stok ${stock}` : ""].filter(Boolean).join(" · ");
  return {
    value: String(p.id),
    label: productOptionLabel(p.sku, p.name),
    hint: hint || undefined,
    keywords: [p.sku, p.name, p.category, p.brand].filter(Boolean).join(" "),
  };
}

export function supplierToOption(s: {
  id: number;
  name: string;
  code?: string | null;
  phone?: string | null;
  city?: string | null;
  tax_number?: string | null;
}): LiveSearchOption {
  const code = displayCode(s.code);
  return {
    value: String(s.id),
    label: code ? `${code} — ${s.name}` : s.name,
    hint: [s.phone, s.city].filter(Boolean).join(" · ") || undefined,
    keywords: [code, s.name, s.phone, s.city, s.tax_number].filter(Boolean).join(" "),
  };
}

async function searchRows<T>(path: string, q: string): Promise<T[]> {
  const query = q.trim();
  if (!query) return [];
  return apiFetch<T[]>(`${path}${path.includes("?") ? "&" : "?"}limit=40&q=${encodeURIComponent(query)}`);
}

export function useCustomerSearch(
  customers: Customer[],
  setCustomers: Dispatch<SetStateAction<Customer[]>>,
) {
  const options = useMemo(() => customers.map(customerToOption), [customers]);
  const fetchMatches = useCallback(
    async (q: string) => {
      const rows = await searchRows<Customer>("/api/customers", q);
      setCustomers((prev) => mergeById(prev, rows));
      return rows.map(customerToOption);
    },
    [setCustomers],
  );
  return { options, fetchMatches };
}

export function useProductSearch(
  products: Product[],
  setProducts: Dispatch<SetStateAction<Product[]>>,
) {
  const options = useMemo(() => products.map(productToOption), [products]);
  const fetchMatches = useCallback(
    async (q: string) => {
      const rows = await searchRows<Product>("/api/products?active_only=true", q);
      setProducts((prev) => mergeById(prev, rows));
      return rows.map(productToOption);
    },
    [setProducts],
  );
  return { options, fetchMatches };
}

export function useSupplierSearch(
  suppliers: Supplier[],
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>,
) {
  const options = useMemo(() => suppliers.map(supplierToOption), [suppliers]);
  const fetchMatches = useCallback(
    async (q: string) => {
      const rows = await searchRows<Supplier>("/api/suppliers?active=true", q);
      setSuppliers((prev) => mergeById(prev, rows));
      return rows.map(supplierToOption);
    },
    [setSuppliers],
  );
  return { options, fetchMatches };
}

export default function LiveSearchSelect({
  value,
  onChange,
  options,
  fetchMatches,
  placeholder = "Ara…",
  required = false,
  disabled = false,
  clearOnSelect = false,
  className = "",
  inputClassName = "bk-input",
  max = 40,
  emptyText = "Eşleşme yok",
  id,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [remote, setRemote] = useState<LiveSearchOption[]>([]);
  const [pending, setPending] = useState(false);
  const [picked, setPicked] = useState<LiveSearchOption | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const fetchRef = useRef(fetchMatches);
  fetchRef.current = fetchMatches;

  const selected = useMemo(() => {
    if (!value) return null;
    return (
      options.find((o) => o.value === value) ||
      remote.find((o) => o.value === value) ||
      (picked && picked.value === value ? picked : null)
    );
  }, [options, remote, picked, value]);

  const shown = useMemo(() => {
    const needle = norm(query.trim());
    const local = needle ? options.filter((o) => haystack(o).includes(needle)) : options;
    const map = new Map<string, LiveSearchOption>();
    if (needle) {
      for (const o of remote) {
        if (haystack(o).includes(needle)) map.set(o.value, o);
      }
    }
    for (const o of local) {
      if (!map.has(o.value)) map.set(o.value, o);
    }
    let list = [...map.values()];
    if (needle) list.sort((a, b) => rank(a, needle) - rank(b, needle) || a.label.localeCompare(b.label, "tr"));
    return list.slice(0, max);
  }, [options, query, remote, max]);

  useEffect(() => {
    setHi((i) => (shown.length === 0 ? 0 : Math.min(i, shown.length - 1)));
  }, [shown]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setCustomValidity(required && !value ? "Listeden bir kayıt seçin" : "");
  }, [required, value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q || !fetchRef.current) {
      setRemote([]);
      setPending(false);
      return;
    }
    let cancel = false;
    setPending(true);
    const timer = window.setTimeout(() => {
      const run = fetchRef.current;
      if (!run) return;
      run(q)
        .then((rows) => {
          if (!cancel) setRemote(rows);
        })
        .catch(() => {
          if (!cancel) setRemote([]);
        })
        .finally(() => {
          if (!cancel) setPending(false);
        });
    }, 120);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, (openUp ? spaceAbove : spaceBelow) - 12));
    const top = openUp ? Math.max(8, r.top - maxHeight - 4) : r.bottom + 4;
    setBox({
      top,
      left: Math.max(8, r.left),
      width: Math.max(r.width, 240),
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, shown.length, query]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = menuRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [hi, open, shown]);

  function choose(opt: LiveSearchOption | null) {
    if (opt) setPicked(opt);
    onChange(opt?.value ?? "", opt);
    setHi(0);
    if (clearOnSelect) {
      setQuery("");
      setRemote([]);
    }
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHi((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      if (!open && !shown.length) return;
      e.preventDefault();
      const opt = shown[hi] ?? shown[0];
      if (opt) choose(opt);
    }
  }

  const inputValue = open ? query : selected?.label || "";

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              top: box.top,
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
              zIndex: 80,
            }}
            className="overflow-auto rounded border border-baykus-line bg-white shadow-lg"
            onMouseDown={(e) => e.preventDefault()}
          >
            {shown.map((o, idx) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={idx === hi}
                data-idx={idx}
                className={`block w-full text-left px-3 py-1.5 text-xs border-b border-baykus-line/50 ${
                  idx === hi ? "bg-sky-100" : "hover:bg-sky-50"
                }`}
                onMouseEnter={() => setHi(idx)}
                onClick={() => choose(o)}
              >
                <span className="font-semibold">{o.label}</span>
                {o.hint ? <span className="text-baykus-muted"> · {o.hint}</span> : null}
              </button>
            ))}
            {shown.length === 0 && (
              <div className="px-3 py-3 text-xs text-baykus-muted">
                {pending ? "Aranıyor…" : emptyText}
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={required && !value}
        placeholder={placeholder}
        className={`${inputClassName} ${value ? "pr-7" : ""}`}
        value={inputValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => {
          const label = selected?.label ?? "";
          setQuery(label);
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onKeyDown={onKeyDown}
      />
      {value && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Temizle"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-baykus-muted hover:text-baykus-text text-sm leading-none px-1"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setPicked(null);
            setQuery("");
            onChange("", null);
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      )}
      {menu}
    </div>
  );
}
