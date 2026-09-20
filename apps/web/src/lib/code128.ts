/** Minimal Code128-B SVG barcode (no external deps). */
const CODE128B_START = 104;
const CODE128_STOP = 106;

const BARS: string[] = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111242","121142","121241","114212","124112","124211","411212",
  "421112","421211","212141","214121","412121","111143","111341","131141","114113","114311",
  "411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
  "112214","122114","122411","121114","221114","141112","141211","112412","122112","122211",
  "143111","111224","111422","121124","121421","141122","2331112",
];

function charValue(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 32 || c > 127) return 0;
  return c - 32;
}

export function encodeCode128B(text: string): number[] {
  const values = [CODE128B_START];
  let checksum = CODE128B_START;
  for (let i = 0; i < text.length; i++) {
    const v = charValue(text[i]);
    values.push(v);
    checksum += v * (i + 1);
  }
  values.push(checksum % 103);
  values.push(CODE128_STOP);
  return values;
}

export function code128Svg(
  text: string,
  opts?: { height?: number; moduleWidth?: number; showText?: boolean },
): string {
  const height = opts?.height ?? 56;
  const mw = opts?.moduleWidth ?? 1.6;
  const showText = opts?.showText !== false;
  const raw = String(text || "").trim() || "0";
  const codes = encodeCode128B(raw);
  let x = 10;
  const rects: string[] = [];
  for (const code of codes) {
    const pat = BARS[code] || BARS[0];
    let drawBar = true;
    for (const dig of pat) {
      const w = Number(dig) * mw;
      if (drawBar) {
        rects.push(
          `<rect x="${x.toFixed(2)}" y="4" width="${w.toFixed(2)}" height="${height}" fill="#0f172a"/>`,
        );
      }
      x += w;
      drawBar = !drawBar;
    }
  }
  const totalW = x + 10;
  const textY = height + 22;
  const label = showText
    ? `<text x="${(totalW / 2).toFixed(2)}" y="${textY}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12" fill="#0f172a">${escapeXml(raw)}</text>`
    : "";
  const vbH = showText ? height + 30 : height + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${vbH}" viewBox="0 0 ${totalW} ${vbH}">${rects.join("")}${label}</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
