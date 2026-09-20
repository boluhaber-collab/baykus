"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { openGlobalSearch } from "@/components/GlobalSearchOverlay";

/**
 * Global Baykuş shortcuts (desktop parity: F1/Ctrl+S kaydet, F2 perakende, Escape geri).
 * Ctrl+S / F1 → click first visible `[data-baykus-save]` (or button/input marked save).
 * F2 → /sales/retail/new
 * Escape → history.back() when not in an open dialog/input that needs Escape.
 * Ctrl+K or / → Akıllı Arama (command palette).
 */
export function useBaykusHotkeys(enabled = true) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;

    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
        return !["checkbox", "radio", "button", "submit", "reset", "file"].includes(type);
      }
      return el.isContentEditable;
    }

    function findSaveControl(): HTMLElement | null {
      const marked = Array.from(
        document.querySelectorAll<HTMLElement>("[data-baykus-save]"),
      ).filter((el) => {
        if (el.hasAttribute("disabled")) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (marked.length) return marked[0];

      // Fallback: visible submit / Kaydet buttons
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          'button[type="submit"], input[type="submit"], button',
        ),
      );
      let best: { score: number; el: HTMLElement } | null = null;
      for (const btn of buttons) {
        if (btn.hasAttribute("disabled")) continue;
        const style = window.getComputedStyle(btn);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const text = (btn.textContent || (btn as HTMLInputElement).value || "")
          .toLocaleLowerCase("tr")
          .trim();
        if (!text.includes("kaydet")) continue;
        let score = 100;
        if (text === "kaydet" || text.includes("kaydet /") || text.includes("satışı kaydet") || text.includes("satış kaydet") || text.includes("teklifi kaydet")) {
          score += 30;
        }
        if (!best || score > best.score) best = { score, el: btn };
      }
      return best?.el ?? null;
    }

    function triggerSave(e: KeyboardEvent) {
      e.preventDefault();
      const el = findSaveControl();
      if (!el) {
        try {
          // subtle feedback — no alert
          document.body.animate?.([{ opacity: 1 }, { opacity: 0.92 }, { opacity: 1 }], { duration: 120 });
        } catch {
          /* ignore */
        }
        return;
      }
      if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
        el.click();
        return;
      }
      // form with data-baykus-save
      if (el instanceof HTMLFormElement) {
        if (typeof el.requestSubmit === "function") el.requestSubmit();
        else el.submit();
        return;
      }
      el.click();
    }

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key;
      const isSaveCombo =
        (e.ctrlKey || e.metaKey) && (key === "s" || key === "S");
      const isSearchCombo =
        (e.ctrlKey || e.metaKey) && (key === "k" || key === "K");
      const isSlashSearch =
        key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
      const isF1 = key === "F1";
      const isF2 = key === "F2";
      const isEsc = key === "Escape";

      if (isSearchCombo || isSlashSearch) {
        e.preventDefault();
        openGlobalSearch();
        return;
      }

      if (isSaveCombo || isF1) {
        triggerSave(e);
        return;
      }

      if (isF2) {
        e.preventDefault();
        if (pathname === "/sales/retail/new") return;
        router.push("/sales/retail/new");
        return;
      }

      if (isEsc) {
        // Don't steal Escape from dialogs / native UI
        const openDialog = document.querySelector("dialog[open], [role='dialog']");
        if (openDialog) return;
        if (isTypingTarget(e.target) && (e.target as HTMLElement).closest("[data-baykus-escape-ignore]")) {
          return;
        }
        // If focus is in a modal-like fixed overlay with close, skip
        const overlay = (e.target as HTMLElement | null)?.closest?.(".fixed.inset-0");
        if (overlay) return;

        e.preventDefault();
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/dashboard");
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, pathname, router]);
}

export default useBaykusHotkeys;
