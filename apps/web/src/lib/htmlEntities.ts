/**
 * Decode HTML numeric/named entities that may remain in BH-imported notes
 * (e.g. &#246; → ö, &#231; → ç, &amp; → &). Safe / idempotent for clean text.
 *
 * Prefer fixing at ingest (Python html.unescape); this is a display safety net.
 */
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (input == null || input === "") return "";
  const s = String(input);
  // Fast path: nothing that looks like an entity
  if (!s.includes("&")) return s;

  // Prefer browser DOM when available (client components)
  if (typeof document !== "undefined") {
    const el = document.createElement("textarea");
    el.innerHTML = s;
    const once = el.value;
    // Rare double-encoding
    if (once.includes("&#") || (once.includes("&") && once.includes(";"))) {
      el.innerHTML = once;
      return el.value;
    }
    return once;
  }

  // SSR / Node: numeric decimal + hex + a few common named entities
  let out = s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#(\d+);/g, (_, d: string) => {
      const cp = parseInt(d, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    });
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };
  out = out.replace(/&([a-zA-Z]+);/g, (m, name: string) => named[name] ?? m);
  return out;
}
