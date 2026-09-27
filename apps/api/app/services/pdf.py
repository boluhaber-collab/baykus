"""Baykuş letterheaded PDF builders — desktop ReportLab canvas twin.

Ports `reports.py` + `pdf_logo_ekle` / `pdf_modern_*` from BaykusBaskiProgram
so web PDFs match desktop antetli layout 1:1 (centered logo, gray header band,
title/subtitle, rounded info boxes, dark table header, footer).
"""

from __future__ import annotations

import os
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdf_canvas

API_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_ROOT = API_ROOT / "uploads"
STATIC_ROOT = Path(__file__).resolve().parents[1] / "static"
DEFAULT_LOGO = STATIC_ROOT / "300x100logo.png"

_FONT_NAME: str | None = None


def _money(v: Any) -> str:
    """Desktop `para_formatla` twin — TL suffix, TR thousands/decimal."""
    try:
        sayi = float(Decimal(str(v or 0)))
    except Exception:
        return f"{v} TL"
    if abs(sayi - round(sayi)) < 1e-7:
        return f"{int(round(sayi)):,} TL".replace(",", ".")
    return f"{sayi:,.2f} TL".replace(",", "X").replace(".", ",").replace("X", ".")


def _qty(v: Any) -> str:
    if v is None:
        return ""
    try:
        sayi = float(str(v).replace(",", "."))
        return str(int(sayi)) if sayi.is_integer() else f"{sayi:g}".replace(".", ",")
    except Exception:
        metin = str(v).strip()
        return "" if metin.lower() in ("nan", "none", "null") else metin


def _s(v: Any, fallback: str = "") -> str:
    if v is None:
        return fallback
    metin = str(v).strip()
    if not metin or metin.lower() in ("nan", "none", "null"):
        return fallback
    return metin



def _date_tr(v: Any) -> str:
    if v is None or v == "" or v == "—":
        return "—"
    if hasattr(v, "strftime"):
        try:
            return v.strftime("%d.%m.%Y")
        except Exception:
            pass
    s = str(v).strip()
    # ISO date / datetime
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            y, m, d = s[:10].split("-")
            return f"{d}.{m}.{y}"
        except Exception:
            pass
    return s

def pdf_font_ayarla() -> str:
    """Register Arial/DejaVu as BaykusFont (desktop twin)."""
    global _FONT_NAME
    if _FONT_NAME:
        return _FONT_NAME
    font_yollari = [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for yol in font_yollari:
        if os.path.exists(yol):
            try:
                pdfmetrics.registerFont(TTFont("BaykusFont", yol))
                _FONT_NAME = "BaykusFont"
                return _FONT_NAME
            except Exception:
                pass
    _FONT_NAME = "Helvetica"
    return _FONT_NAME


def _resolve_logo(settings: dict[str, str] | None) -> Path | None:
    settings = settings or {}
    candidates: list[Path] = []
    for key in ("form_logo_dosyasi", "logo_dosyasi", "logo", "logo_path"):
        raw = (settings.get(key) or "").strip()
        if not raw:
            continue
        candidates.extend(
            [
                Path(raw),
                UPLOADS_ROOT / raw,
                UPLOADS_ROOT / "logos" / raw,
                UPLOADS_ROOT / "logos" / Path(raw).name,
                API_ROOT / raw,
                Path.cwd() / raw,
            ]
        )
    candidates.extend(
        [
            UPLOADS_ROOT / "logos" / "300x100logo.png",
            UPLOADS_ROOT / "logos" / "pdf_form_logo.png",
            DEFAULT_LOGO,
            API_ROOT / "300x100logo.png",
        ]
    )
    seen: set[str] = set()
    for c in candidates:
        try:
            key = str(c.resolve()) if c.exists() else str(c)
        except OSError:
            key = str(c)
        if key in seen:
            continue
        seen.add(key)
        try:
            if c.is_file() and c.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                return c
        except OSError:
            continue
    return None


def pdf_logo_ekle(
    c: pdf_canvas.Canvas,
    sayfa_genisligi: float,
    sayfa_yuksekligi: float,
    y_ust: float | None = None,
    settings: dict[str, str] | None = None,
) -> float:
    """Centered logo — desktop `pdf_logo_ekle` twin (max 4.8×1.8 cm)."""
    try:
        logo_path = _resolve_logo(settings)
        if logo_path is None:
            return sayfa_yuksekligi - 2 * cm if y_ust is None else y_ust

        logo = ImageReader(str(logo_path))
        orj_w, orj_h = logo.getSize()
        hedef_w = 4.8 * cm
        hedef_h = hedef_w * orj_h / orj_w
        if hedef_h > 1.8 * cm:
            hedef_h = 1.8 * cm
            hedef_w = hedef_h * orj_w / orj_h

        x = (sayfa_genisligi - hedef_w) / 2
        if y_ust is None:
            y_ust = sayfa_yuksekligi - 0.8 * cm
        y = y_ust - hedef_h

        c.drawImage(
            str(logo_path),
            x,
            y,
            width=hedef_w,
            height=hedef_h,
            preserveAspectRatio=True,
            mask="auto",
        )
        return y - 0.7 * cm
    except Exception:
        return sayfa_yuksekligi - 2 * cm if y_ust is None else y_ust


def _alt_baslik_from_settings(settings: dict[str, str] | None, fallback: str = "") -> str:
    settings = settings or {}
    return (
        (settings.get("pdf_alt_baslik") or "").strip()
        or fallback
        or "Kişiye ve Kuruma Özel Baskı Hizmetleri"
    )


def pdf_modern_baslik(
    c: pdf_canvas.Canvas,
    width: float,
    height: float,
    baslik: str,
    alt_baslik: str = "",
    settings: dict[str, str] | None = None,
    logo_goster: bool = True,
) -> float:
    """Gray header band + centered logo + title + subtitle + rule (desktop twin)."""
    font = pdf_font_ayarla()
    c.setFillColorRGB(0.96, 0.96, 0.96)
    c.rect(0, height - 3.4 * cm, width, 3.4 * cm, fill=1, stroke=0)

    if logo_goster:
        y = pdf_logo_ekle(c, width, height, height - 0.45 * cm, settings)
    else:
        y = height - 2 * cm

    c.setFillColorRGB(0.08, 0.08, 0.08)
    c.setFont(font, 15)
    c.drawCentredString(width / 2, y - 0.15 * cm, baslik)

    if not alt_baslik:
        alt_baslik = _alt_baslik_from_settings(settings)

    if alt_baslik:
        c.setFont(font, 9)
        c.setFillColorRGB(0.35, 0.35, 0.35)
        c.drawCentredString(width / 2, y - 0.65 * cm, alt_baslik)

    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(0.6)
    c.line(1.4 * cm, height - 3.55 * cm, width - 1.4 * cm, height - 3.55 * cm)
    c.setFillColorRGB(0, 0, 0)
    return height - 4.1 * cm


def pdf_modern_altbilgi(
    c: pdf_canvas.Canvas,
    width: float,
    sayfa_no: int = 1,
    settings: dict[str, str] | None = None,
) -> None:
    font = pdf_font_ayarla()
    settings = settings or {}
    company = (settings.get("company_name") or "Baykuş Baskı").strip() or "Baykuş Baskı"
    web = (settings.get("web_adresi") or "www.baykusbaski.com").strip() or "www.baykusbaski.com"
    web = web.replace("https://", "").replace("http://", "").rstrip("/")
    c.setFont(font, 7)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(0.6)
    c.line(1.4 * cm, 1.45 * cm, width - 1.4 * cm, 1.45 * cm)
    c.drawString(1.5 * cm, 1.05 * cm, f"{company} | {web}")
    c.drawRightString(width - 1.5 * cm, 1.05 * cm, f"Sayfa {sayfa_no}")
    c.setFillColorRGB(0, 0, 0)


def pdf_modern_kutu(
    c: pdf_canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    baslik: str = "",
    metin: str = "",
    fill: tuple[float, float, float] = (0.98, 0.98, 0.98),
) -> None:
    font = pdf_font_ayarla()
    c.setFillColorRGB(*fill)
    c.roundRect(x, y - h, w, h, 6, fill=1, stroke=0)
    c.setStrokeColorRGB(0.88, 0.88, 0.88)
    c.roundRect(x, y - h, w, h, 6, fill=0, stroke=1)

    baslik = "" if baslik is None else str(baslik).replace("\n", " ").replace("\r", " ").strip()
    metin = "" if metin is None else str(metin).replace("\n", " ").replace("\r", " ").strip()
    if baslik.lower() == "nan":
        baslik = ""
    if metin.lower() == "nan":
        metin = ""

    def kisalt(txt: str, max_kar: int) -> str:
        txt = str(txt)
        return txt if len(txt) <= max_kar else txt[: max(0, max_kar - 3)] + "..."

    max_kar = max(8, int(w / (0.115 * cm)))

    if h <= 0.82 * cm:
        tek_satir = f"{baslik}: {metin}" if baslik and metin else (baslik or metin)
        c.setFont(font, 7.6)
        c.setFillColorRGB(0.12, 0.12, 0.12)
        c.drawString(x + 0.22 * cm, y - (h / 2) - 0.03 * cm, kisalt(tek_satir, max_kar))
    else:
        c.setFillColorRGB(0.18, 0.18, 0.18)
        if baslik:
            c.setFont(font, 7.2)
            c.drawString(x + 0.26 * cm, y - 0.38 * cm, kisalt(baslik, max_kar))
        if metin:
            c.setFont(font, 9.2)
            value_y = y - 0.76 * cm
            if h > 1.15 * cm:
                value_y = y - 0.88 * cm
            c.drawString(x + 0.26 * cm, value_y, kisalt(metin, max_kar))
    c.setFillColorRGB(0, 0, 0)


def pdf_kisa_metin(metin: Any, max_karakter: int) -> str:
    metin = "" if metin is None else str(metin)
    if metin.lower() == "nan":
        metin = ""
    metin = metin.replace("\n", " ").replace("\r", " ").strip()
    if len(metin) > max_karakter:
        return metin[: max(0, max_karakter - 3)] + "..."
    return metin


def _miktar_kolonu_mu(kolon: str) -> bool:
    kolon = str(kolon or "").casefold()
    dahil = ("adet", "stok", "miktar", "ürün sayısı", "urun sayisi")
    haric = ("fiyat", "tutar", "toplam", "maliyet", "bakiye", "tarih", "telefon", "no")
    return any(a in kolon for a in dahil) and not any(a in kolon for a in haric)


def pdf_excel_tablo(
    c: pdf_canvas.Canvas,
    width: float,
    height: float,
    y: float,
    baslik: str,
    kolonlar: list[str],
    satirlar: list[list[Any]],
    oranlar: list[float] | None = None,
    sayfa_baslik: str = "Rapor",
    alt_baslik: str = "Baykuş Baskı",
    sayfa_no: int = 1,
    settings: dict[str, str] | None = None,
) -> tuple[float, int]:
    """Dark rounded header + zebra rows — desktop `pdf_excel_tablo` twin."""
    font = pdf_font_ayarla()
    sol = 1.3 * cm
    sag = width - 1.3 * cm
    tablo_w = sag - sol
    alt_limit = 2.1 * cm

    if oranlar is None:
        oranlar = [1.0] * len(kolonlar)
    toplam_oran = sum(oranlar) or 1.0
    genislikler = [tablo_w * oran / toplam_oran for oran in oranlar]

    def hucre_metin(metin: Any, w: float) -> str:
        max_kar = max(4, int(w / (0.13 * cm)))
        return pdf_kisa_metin(metin, max_kar)

    def yeni_sayfa() -> float:
        nonlocal y, sayfa_no
        pdf_modern_altbilgi(c, width, sayfa_no, settings)
        c.showPage()
        sayfa_no += 1
        y = pdf_modern_baslik(c, width, height, sayfa_baslik, alt_baslik, settings)
        return y

    def baslik_ciz() -> None:
        nonlocal y
        if y < 3.2 * cm:
            yeni_sayfa()
        if baslik:
            c.setFont(font, 10)
            c.setFillColorRGB(0.12, 0.12, 0.12)
            c.drawString(sol, y, baslik)
            y -= 0.45 * cm
        header_h = 0.58 * cm
        c.setFillColorRGB(0.13, 0.13, 0.13)
        c.roundRect(sol, y - header_h, tablo_w, header_h, 4, fill=1, stroke=0)
        x = sol
        c.setFont(font, 7.5)
        c.setFillColorRGB(1, 1, 1)
        for i, kolon in enumerate(kolonlar):
            c.drawString(x + 0.10 * cm, y - 0.37 * cm, hucre_metin(kolon, genislikler[i] - 0.20 * cm))
            x += genislikler[i]
        y -= header_h

    baslik_ciz()
    row_h = 0.52 * cm

    for sira, satir in enumerate(satirlar):
        if y < alt_limit + row_h:
            yeni_sayfa()
            baslik_ciz()

        if sira % 2 == 0:
            c.setFillColorRGB(0.985, 0.985, 0.985)
        else:
            c.setFillColorRGB(0.94, 0.96, 0.98)
        c.rect(sol, y - row_h, tablo_w, row_h, fill=1, stroke=0)
        c.setStrokeColorRGB(0.82, 0.82, 0.82)
        c.setLineWidth(0.35)
        x = sol
        for w in genislikler:
            c.line(x, y, x, y - row_h)
            x += w
        c.line(sol + tablo_w, y, sol + tablo_w, y - row_h)
        c.line(sol, y - row_h, sol + tablo_w, y - row_h)

        c.setFillColorRGB(0.08, 0.08, 0.08)
        c.setFont(font, 7.2)
        x = sol
        for i, deger in enumerate(satir):
            if i >= len(kolonlar):
                break
            val = deger
            if _miktar_kolonu_mu(kolonlar[i]):
                val = _qty(deger)
            metin = hucre_metin(val, genislikler[i] - 0.20 * cm)
            baslik_kucuk = str(kolonlar[i]).lower()
            sayisal = any(
                k in baslik_kucuk
                for k in ("tutar", "toplam", "borç", "borc", "ödeme", "odeme", "bakiye", "fiyat", "alış", "alis", "değer", "deger")
            )
            if sayisal:
                c.drawRightString(x + genislikler[i] - 0.10 * cm, y - 0.35 * cm, metin)
            else:
                c.drawString(x + 0.10 * cm, y - 0.35 * cm, metin)
            x += genislikler[i]
        y -= row_h

    c.setFillColorRGB(0, 0, 0)
    c.setStrokeColorRGB(0, 0, 0)
    return y - 0.35 * cm, sayfa_no


def _info_boxes_two_col(
    c: pdf_canvas.Canvas,
    y: float,
    bilgiler: list[tuple[str, str]],
    per_col: int = 4,
) -> float:
    """Two-column rounded info boxes — desktop teklif/iş emri layout."""
    x1 = 1.4 * cm
    x2 = 10.5 * cm
    kutu_y = y
    for i, (baslik, deger) in enumerate(bilgiler):
        x = x1 if i < per_col else x2
        yy = kutu_y - (i % per_col) * 0.86 * cm
        pdf_modern_kutu(c, x, yy, 8.2 * cm, 0.74 * cm, baslik, str(deger), fill=(0.985, 0.985, 0.985))
    n_left = min(len(bilgiler), per_col)
    n_right = max(0, len(bilgiler) - per_col)
    rows = max(n_left, n_right, 1)
    # Desktop teklif uses ~3.95cm for 4 rows; 0.86*rows + 0.55 ≈ that spacing.
    return y - (rows * 0.86 * cm + 0.55 * cm)


def _totals_boxes(
    c: pdf_canvas.Canvas,
    y: float,
    items: list[tuple[str, str]],
    genel: tuple[str, str] | None = None,
) -> float:
    """Right-aligned summary boxes; genel toplam gets green fill."""
    # Pair items in rows of 2
    i = 0
    while i < len(items):
        if i + 1 < len(items):
            pdf_modern_kutu(c, 10.7 * cm, y, 4.2 * cm, 1.15 * cm, items[i][0], items[i][1])
            pdf_modern_kutu(c, 15.1 * cm, y, 4.2 * cm, 1.15 * cm, items[i + 1][0], items[i + 1][1])
            i += 2
        else:
            pdf_modern_kutu(c, 10.7 * cm, y, 8.6 * cm, 1.15 * cm, items[i][0], items[i][1])
            i += 1
        y -= 1.35 * cm
    if genel:
        pdf_modern_kutu(
            c, 10.7 * cm, y, 8.6 * cm, 1.25 * cm, genel[0], genel[1], fill=(0.90, 0.96, 0.92)
        )
        y -= 1.65 * cm
    return y


def _ensure_space(
    c: pdf_canvas.Canvas,
    width: float,
    height: float,
    y: float,
    need: float,
    sayfa_no: int,
    baslik: str,
    alt_baslik: str,
    settings: dict[str, str] | None,
) -> tuple[float, int]:
    if y < need:
        pdf_modern_altbilgi(c, width, sayfa_no, settings)
        c.showPage()
        sayfa_no += 1
        y = pdf_modern_baslik(c, width, height, baslik, alt_baslik, settings)
    return y, sayfa_no



def _new_doc() -> tuple[BytesIO, pdf_canvas.Canvas, float, float]:
    buf = BytesIO()
    c = pdf_canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    return buf, c, width, height


# ---------------------------------------------------------------------------
# Document builders
# ---------------------------------------------------------------------------


def build_quote_pdf(quote: Any, settings: dict[str, str]) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    alt = _alt_baslik_from_settings(settings)
    logo_goster = str(settings.get("teklif_sablon_logo_goster", "Evet")).strip().casefold() not in (
        "hayır",
        "hayir",
        "no",
        "0",
        "false",
    )
    form_basligi = (settings.get("teklif_sablon_baslik") or "Teklif Formu").strip() or "Teklif Formu"
    y = pdf_modern_baslik(c, width, height, form_basligi, alt, settings, logo_goster=logo_goster)

    cust = getattr(getattr(quote, "customer", None), "name", None) or "—"
    phone = getattr(getattr(quote, "customer", None), "phone", None) or ""
    bilgiler = [
        ("No", str(quote.quote_number)),
        ("Belge Tipi", "Teklif"),
        ("Tarih", quote.created_at.strftime("%d.%m.%Y %H:%M") if quote.created_at else "—"),
        ("Müşteri", str(cust)),
        ("Telefon", str(phone or "—")),
        ("Geçerlilik", _date_tr(quote.valid_until)),
        ("Durum", str(quote.status or "—")),
    ]
    y = _info_boxes_two_col(c, y, bilgiler, per_col=4)

    satirlar: list[list[Any]] = []
    for line in quote.lines or []:
        urun = _s(line.description)
        detaylar = []
        for alan, val in (("Beden", line.size), ("Renk", line.color), ("Baskı Türü", line.print_type)):
            if _s(val):
                detaylar.append(f"{alan}: {_s(val)}")
        if detaylar:
            urun = f"{urun} ({', '.join(detaylar)})"
        satirlar.append([urun, _qty(line.quantity), _money(line.unit_price), _money(line.line_total)])

    y, sayfa_no = pdf_excel_tablo(
        c,
        width,
        height,
        y,
        "Ürünler",
        ["Ürün", "Adet", "Birim Fiyat", "Toplam"],
        satirlar,
        oranlar=[5.5, 1.0, 1.6, 1.6],
        sayfa_baslik=form_basligi,
        alt_baslik=alt,
        settings=settings,
    )

    ara = sum((Decimal(str(getattr(l, "line_total", 0) or 0)) for l in (quote.lines or [])), Decimal("0"))
    iskonto = Decimal(str(quote.discount_amount or 0))
    genel = Decimal(str(quote.total_amount or (ara - iskonto)))

    y, sayfa_no = _ensure_space(c, width, height, y, 5.2 * cm, sayfa_no, form_basligi, alt, settings)
    y = _totals_boxes(
        c,
        y,
        [("Ara Toplam", _money(ara)), ("İskonto", _money(iskonto))],
        genel=("Genel Toplam", _money(genel)),
    )

    if quote.notes:
        font = pdf_font_ayarla()
        c.setFont(font, 9)
        c.drawString(1.4 * cm, y, "Not:")
        y -= 0.45 * cm
        for i in range(0, len(str(quote.notes)), 95):
            c.drawString(1.4 * cm, y, str(quote.notes)[i : i + 95])
            y -= 0.45 * cm

    pdf_modern_altbilgi(c, width, sayfa_no, settings)
    c.save()
    return buf.getvalue()


def build_work_order_pdf(order: Any, settings: dict[str, str]) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    alt = "Üretim Takip Formu"
    y = pdf_modern_baslik(c, width, height, "İş Emri", alt, settings)

    cust = getattr(getattr(order, "customer", None), "name", None) or "—"
    phone = getattr(getattr(order, "customer", None), "phone", None) or ""
    delivery = order.delivery_date or order.due_date
    bilgiler = [
        ("Sipariş No", str(order.order_number)),
        ("Sipariş Tarihi", order.created_at.strftime("%d.%m.%Y") if order.created_at else "—"),
        ("Müşteri", str(cust)),
        ("Telefon", str(phone or "—")),
        ("Teslim Tarihi", _date_tr(delivery)),
        ("Durum", str(order.status or "—")),
    ]
    y = _info_boxes_two_col(c, y, bilgiler, per_col=3)

    satirlar: list[list[Any]] = []
    for line in order.lines or []:
        satirlar.append(
            [
                _s(line.description),
                _s(line.size, "—"),
                _s(line.color, "—"),
                _s(line.print_type, "—"),
                _qty(line.quantity),
            ]
        )

    y, sayfa_no = pdf_excel_tablo(
        c,
        width,
        height,
        y,
        "Üretilecek Ürünler",
        ["Ürün", "Beden", "Renk", "Baskı", "Adet"],
        satirlar,
        oranlar=[4.2, 1.1, 1.1, 1.8, 0.8],
        sayfa_baslik="İş Emri",
        alt_baslik="Baykuş Baskı",
        settings=settings,
    )

    if getattr(order, "design_notes", None) or order.notes:
        font = pdf_font_ayarla()
        y, sayfa_no = _ensure_space(c, width, height, y, 3.0 * cm, sayfa_no, "İş Emri", alt, settings)
        c.setFont(font, 9)
        if getattr(order, "design_notes", None):
            c.drawString(1.4 * cm, y, f"Tasarım notu: {order.design_notes}")
            y -= 0.45 * cm
        if order.notes:
            c.drawString(1.4 * cm, y, f"Not: {order.notes}")

    _finish_note = "Bu iş emri üretim takibi içindir; müşteriye verilmesi zorunlu değildir."
    font = pdf_font_ayarla()
    c.setFont(font, 8)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    c.drawString(1.4 * cm, 1.65 * cm, _finish_note)
    c.setFillColorRGB(0, 0, 0)
    pdf_modern_altbilgi(c, width, sayfa_no, settings)
    c.save()
    return buf.getvalue()


def build_assets_report_pdf(rows: list[dict[str, Any]], settings: dict[str, str] | None = None) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    alt = _alt_baslik_from_settings(settings, "Baykuş Baskı")
    y = pdf_modern_baslik(c, width, height, "Demirbaş Raporu", alt, settings)

    total = sum(Decimal(str(r.get("current_value") or 0)) for r in rows)
    pdf_modern_kutu(c, 1.4 * cm, y, 8.2 * cm, 0.9 * cm, "Toplam Kayıt", str(len(rows)))
    pdf_modern_kutu(c, 10.5 * cm, y, 8.2 * cm, 0.9 * cm, "Güncel Değer", _money(total), fill=(0.90, 0.96, 0.92))
    y -= 1.35 * cm

    tablo = [
        [
            _s(r.get("name"))[:36],
            _s(r.get("category"))[:18],
            _s(r.get("status"))[:12],
            _money(r.get("current_value")),
            _s(r.get("maintenance_date"))[:12],
        ]
        for r in rows[:200]
    ]
    y, sayfa_no = pdf_excel_tablo(
        c,
        width,
        height,
        y,
        "Demirbaş Listesi",
        ["Demirbaş", "Kategori", "Durum", "Değer", "Bakım"],
        tablo,
        oranlar=[3.2, 1.6, 1.2, 1.5, 1.3],
        sayfa_baslik="Demirbaş Raporu",
        alt_baslik=alt,
        settings=settings,
    )
    pdf_modern_altbilgi(c, width, sayfa_no, settings)
    c.save()
    return buf.getvalue()


def build_cari_statement_pdf(
    customer_name: str,
    rows: list[dict[str, Any]],
    closing_balance: Any,
    settings: dict[str, str] | None = None,
) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    from datetime import datetime

    y = pdf_modern_baslik(c, width, height, "Cari Hesap Dökümü", "Baykuş Baskı", settings)

    pdf_modern_kutu(c, 1.4 * cm, y, 5.7 * cm, 0.9 * cm, "Müşteri", customer_name)
    pdf_modern_kutu(c, 7.4 * cm, y, 4.6 * cm, 0.9 * cm, "Hareket", str(len(rows)))
    pdf_modern_kutu(
        c,
        12.3 * cm,
        y,
        6.8 * cm,
        0.9 * cm,
        "Döküm Tarihi",
        datetime.now().strftime("%d.%m.%Y %H:%M"),
    )
    y -= 1.2 * cm

    debit_sum = sum((Decimal(str(r.get("debit") or 0)) for r in rows), Decimal("0"))
    credit_sum = sum((Decimal(str(r.get("credit") or 0)) for r in rows), Decimal("0"))
    pdf_modern_kutu(c, 1.4 * cm, y, 5.2 * cm, 1.0 * cm, "Toplam Borç", _money(debit_sum))
    pdf_modern_kutu(c, 6.9 * cm, y, 5.2 * cm, 1.0 * cm, "Toplam Alacak", _money(credit_sum))
    pdf_modern_kutu(
        c,
        12.4 * cm,
        y,
        5.2 * cm,
        1.0 * cm,
        "Kapanış Bakiyesi",
        _money(closing_balance),
        fill=(0.90, 0.96, 0.92),
    )
    y -= 1.45 * cm

    tablo: list[list[Any]] = []
    if rows:
        for r in rows[:400]:
            tablo.append(
                [
                    str(r.get("date") or "")[:10],
                    _s(r.get("type")),
                    _money(r.get("debit")),
                    _money(r.get("credit")),
                    _money(r.get("balance")),
                    _s(r.get("note"))[:40],
                ]
            )
    else:
        tablo.append(["", "", "", "", "", "Cari hareket kaydı bulunamadı."])

    y, sayfa_no = pdf_excel_tablo(
        c,
        width,
        height,
        y,
        "Cari Hesap Ekstresi",
        ["Tarih", "İşlem", "Borç", "Alacak", "Bakiye", "Açıklama"],
        tablo,
        oranlar=[1.1, 1.3, 1.15, 1.15, 1.15, 3.0],
        sayfa_baslik="Cari Hesap Dökümü",
        alt_baslik="Baykuş Baskı",
        settings=settings,
    )

    font = pdf_font_ayarla()
    c.setFont(font, 8)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    c.drawString(1.4 * cm, 1.65 * cm, "Bu döküm Baykuş Baskı işletme programı tarafından otomatik oluşturulmuştur.")
    c.setFillColorRGB(0, 0, 0)
    pdf_modern_altbilgi(c, width, sayfa_no, settings)
    c.save()
    return buf.getvalue()


def build_price_list_pdf(
    list_name: str, rows: list[dict[str, Any]], settings: dict[str, str] | None = None
) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    alt = _alt_baslik_from_settings(settings, "Baykuş Baskı")
    y = pdf_modern_baslik(c, width, height, f"Fiyat Listesi — {list_name}", alt, settings)

    pdf_modern_kutu(c, 1.4 * cm, y, 8.2 * cm, 0.9 * cm, "Liste", str(list_name)[:40])
    pdf_modern_kutu(c, 10.5 * cm, y, 8.2 * cm, 0.9 * cm, "Kalem", str(len(rows)))
    y -= 1.35 * cm

    tablo = [
        [
            _s(r.get("description"))[:34],
            _s(r.get("supplier_name"))[:18],
            _money(r.get("purchase_price")),
            _money(r.get("blank_price")),
            _money(r.get("printed_price")),
            _money(r.get("embroidered_price")),
        ]
        for r in rows[:300]
    ]
    y, sayfa_no = pdf_excel_tablo(
        c,
        width,
        height,
        y,
        "Fiyat Kalemleri",
        ["Ürün", "Tedarikçi", "Alış", "Baskısız", "Baskılı", "Nakışlı"],
        tablo,
        oranlar=[2.6, 1.6, 1.2, 1.2, 1.2, 1.2],
        sayfa_baslik=f"Fiyat Listesi — {list_name}",
        alt_baslik=alt,
        settings=settings,
    )
    pdf_modern_altbilgi(c, width, sayfa_no, settings)
    c.save()
    return buf.getvalue()


def build_supplier_voucher_pdf(
    supplier_name: str,
    tip: str,
    amount: Any,
    movement_date: str,
    due_date: str = "",
    note: str = "",
    settings: dict[str, str] | None = None,
) -> bytes:
    buf, c, width, height = _new_doc()
    settings = settings or {}
    alt = _alt_baslik_from_settings(settings, "Baykuş Baskı")
    y = pdf_modern_baslik(c, width, height, "Borç-Alacak Fişi", alt, settings)

    bilgiler = [
        ("Tedarikçi", str(supplier_name or "")),
        ("İşlem Tipi", str(tip or "")),
        ("İşlem Tarihi", str(movement_date or "")[:10]),
        ("Vade", str(due_date or "—")[:10]),
        ("Tutar", _money(amount)),
        ("Açıklama", str(note or "—")[:80]),
    ]
    y = _info_boxes_two_col(c, y, bilgiler, per_col=3)

    fill = (0.90, 0.96, 0.92) if "Alacak" in str(tip) else (0.98, 0.93, 0.93)
    pdf_modern_kutu(c, 10.7 * cm, y, 8.6 * cm, 1.25 * cm, "Tutar", _money(amount), fill=fill)
    y -= 1.8 * cm

    font = pdf_font_ayarla()
    c.setFont(font, 8.5)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    c.drawString(
        1.4 * cm,
        y,
        "Bu fiş kasa/banka hareketi oluşturmaz; yalnızca tedarikçi cari bakiyesini düzenler.",
    )
    c.setFillColorRGB(0, 0, 0)

    pdf_modern_altbilgi(c, width, 1, settings)
    c.save()
    return buf.getvalue()
