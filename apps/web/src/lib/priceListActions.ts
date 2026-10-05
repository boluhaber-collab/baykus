/**
 * Fiyat listesi — Yazdır / PDF olarak kaydet / Paylaş yardımcıları.
 * API uçları Bearer token istediği için window.open yerine yetkili fetch kullanılır.
 */
import { PriceList, apiFetch, clearToken, formatMoney, getApiBase, getToken } from "@/lib/api";

async function authFetch(path: string): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Yetkisiz");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Hata: ${res.status}`;
    try {
      const data = text ? JSON.parse(text) : {};
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      if (text && text.length < 200) message = text;
    }
    throw new Error(message);
  }
  return res;
}

/** Dosya adı: "fiyat-listesi-bayi-2026.pdf" (Türkçe karakterler sadeleştirilir). */
export function priceListFileName(name: string, ext = "pdf"): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
  const base = (name || "")
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => map[ch] || ch)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  return `fiyat-listesi-${base || "liste"}.${ext}`;
}

export async function fetchPriceListPdf(id: number, customer: boolean): Promise<Blob> {
  const res = await authFetch(`/api/price-lists/${id}/export?fmt=pdf${customer ? "&customer=true" : ""}`);
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("PDF boş döndü");
  return blob;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** PDF olarak kaydet. */
export async function savePriceListPdf(id: number, name: string, customer = false): Promise<void> {
  const blob = await fetchPriceListPdf(id, customer);
  triggerDownload(blob, priceListFileName(name));
}

/** Yazdır — yetkili HTML'i gizli iframe'e yükleyip tarayıcı yazdırma penceresini açar (popup engeline takılmaz). */
export async function printPriceList(id: number, customer = false): Promise<void> {
  const res = await authFetch(`/api/price-lists/${id}/export?fmt=html${customer ? "&customer=true" : ""}`);
  const html = await res.text();
  const old = document.getElementById("bk-price-print-frame");
  if (old) old.remove();
  const frame = document.createElement("iframe");
  frame.id = "bk-price-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  if (!win) throw new Error("Yazdırma penceresi açılamadı");
  win.focus();
  win.print();
}

/** Müşteriye gönderilecek düz metin (alış fiyatı / tedarikçi yok). */
export function priceListShareText(pl: PriceList, maxLines = 60): string {
  const items = pl.items || [];
  const fmt = (v: unknown) => formatMoney(Number(v) || 0);
  const lines = items.slice(0, maxLines).map((it) => {
    const parts: string[] = [];
    const blank = Number(it.blank_price ?? it.unit_price ?? 0);
    if (blank > 0) parts.push(`Baskısız ${fmt(blank)}`);
    if (Number(it.printed_price) > 0) parts.push(`Baskılı ${fmt(it.printed_price)}`);
    if (Number(it.embroidered_price) > 0) parts.push(`Nakışlı ${fmt(it.embroidered_price)}`);
    return `• ${it.description}${parts.length ? " — " + parts.join(" · ") : ""}`;
  });
  const more = items.length > maxLines ? `\n… ve ${items.length - maxLines} kalem daha (PDF ekte)` : "";
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  return `*Fiyat Listesi — ${pl.name}*\n${date}\n\n${lines.join("\n") || "(kalem yok)"}${more}`;
}

export async function loadPriceList(id: number): Promise<PriceList> {
  return apiFetch<PriceList>(`/api/price-lists/${id}`);
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "x.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Web Share API ile PDF paylaş (Windows paylaş menüsü / mobilde WhatsApp vb.). false → iptal. */
export async function shareNativePdf(id: number, name: string): Promise<boolean> {
  const blob = await fetchPriceListPdf(id, true);
  const file = new File([blob], priceListFileName(name), { type: "application/pdf" });
  try {
    await navigator.share({ files: [file], title: `Fiyat Listesi — ${name}`, text: `Fiyat Listesi — ${name}` });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    throw e;
  }
}
