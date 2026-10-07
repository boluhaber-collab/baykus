/**
 * Print a letterheaded PDF from an authenticated API path (same pattern as fiyat listesi).
 */
import { getApiBase, getToken } from "@/lib/api";

async function authFetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getApiBase()}${path}`, { headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `PDF alınamadı (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error("PDF boş döndü");
  return blob;
}

/** Fetch API PDF and send to printer (iframe → print; popup fallback). */
export async function printPdfFromApi(path: string, frameId = "bk-pdf-print-frame"): Promise<void> {
  const blob = await authFetchBlob(path);
  const url = URL.createObjectURL(blob);
  const prev = document.getElementById(frameId);
  if (prev) prev.remove();

  const revokeLater = () => {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const openTabFallback = (): void => {
    const w = window.open(url, "_blank");
    if (!w) {
      revokeLater();
      throw new Error("Yazdırma penceresi açılamadı (popup engellendi)");
    }
    revokeLater();
  };

  const frame = document.createElement("iframe");
  frame.id = frameId;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let printDelay: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (printDelay != null) clearTimeout(printDelay);
      try {
        fn();
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Yazdırma hatası"));
      }
    };

    const tryPrint = () => {
      if (settled) return;
      try {
        const win = frame.contentWindow;
        if (!win) {
          finish(openTabFallback);
          return;
        }
        win.focus();
        win.print();
        revokeLater();
        finish(() => undefined);
      } catch {
        finish(openTabFallback);
      }
    };

    const watchdog = setTimeout(() => finish(openTabFallback), 8000);
    frame.onload = () => {
      printDelay = setTimeout(tryPrint, 300);
    };
    frame.src = url;
  });
}
