"""ReportLab PDF builders for quotes, work orders, cari, price lists, vouchers.

Closer to desktop layout (headers / logo / totals) — still not a ReportLab twin.
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

API_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_ROOT = API_ROOT / "uploads"


def _money(v: Any) -> str:
    try:
        d = Decimal(str(v or 0))
    except Exception:
        d = Decimal("0")
    return f"{d:,.2f} ₺".replace(",", "X").replace(".", ",").replace("X", ".")


def _resolve_logo(settings: dict[str, str]) -> Path | None:
    """Resolve logo_dosyasi / form_logo_dosyasi to an existing image path."""
    for key in ("form_logo_dosyasi", "logo_dosyasi", "logo", "logo_path"):
        raw = (settings.get(key) or "").strip()
        if not raw:
            continue
        candidates = [
            Path(raw),
            UPLOADS_ROOT / raw,
            UPLOADS_ROOT / "logos" / raw,
            API_ROOT / raw,
            Path.cwd() / raw,
        ]
        for c in candidates:
            try:
                if c.is_file() and c.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
                    return c
            except OSError:
                continue
    return None


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "BkTitle",
            parent=base["Heading1"],
            fontSize=16,
            spaceAfter=2,
            textColor=colors.HexColor("#0f172a"),
            leading=20,
        ),
        "doc_title": ParagraphStyle(
            "BkDocTitle",
            parent=base["Heading2"],
            fontSize=14,
            spaceBefore=4,
            spaceAfter=8,
            textColor=colors.HexColor("#0f172a"),
            leading=18,
        ),
        "sub": ParagraphStyle(
            "BkSub",
            parent=base["Normal"],
            fontSize=8,
            textColor=colors.HexColor("#64748b"),
            leading=11,
            spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "BkBody",
            parent=base["Normal"],
            fontSize=9,
            textColor=colors.HexColor("#1e293b"),
            leading=12,
        ),
        "small": ParagraphStyle(
            "BkSmall",
            parent=base["Normal"],
            fontSize=7.5,
            textColor=colors.HexColor("#64748b"),
            leading=10,
        ),
        "total": ParagraphStyle(
            "BkTotal",
            parent=base["Normal"],
            fontSize=11,
            textColor=colors.HexColor("#0f172a"),
            leading=14,
        ),
    }


def _company_header(settings: dict[str, str], accent: str = "#0f172a") -> list:
    st = _styles()
    name = settings.get("company_name") or "Baykuş Baskı"
    phone = (settings.get("phone") or "").strip()
    email = (settings.get("email") or settings.get("company_email") or "").strip()
    address = (settings.get("address") or settings.get("adres") or "").strip()
    tax = (settings.get("tax_office") or settings.get("vergi_dairesi") or "").strip()
    tax_no = (settings.get("tax_no") or settings.get("vergi_no") or "").strip()

    left_bits: list = [Paragraph(name, st["title"])]
    meta_lines = []
    if address:
        meta_lines.append(address)
    if phone:
        meta_lines.append(f"Tel: {phone}")
    if email:
        meta_lines.append(email)
    if tax or tax_no:
        meta_lines.append(" · ".join(x for x in (tax, tax_no) if x))
    for line in meta_lines:
        left_bits.append(Paragraph(line, st["sub"]))

    logo_path = _resolve_logo(settings)
    if logo_path:
        try:
            img = Image(str(logo_path), width=28 * mm, height=14 * mm, kind="proportional")
            header = Table([[left_bits, img]], colWidths=[140 * mm, 32 * mm])
            header.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ]
                )
            )
            bits = [header]
        except Exception:
            bits = list(left_bits)
    else:
        bits = list(left_bits)

    bits.append(Spacer(1, 4))
    bits.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor(accent), spaceAfter=8))
    return bits


def _meta_table(rows: list[list[str]], label_w: float = 38 * mm, value_w: float = 122 * mm) -> Table:
    t = Table(rows, colWidths=[label_w, value_w])
    t.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
                ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#0f172a")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def _data_table(rows: list[list[Any]], col_widths: list, header_bg: str) -> Table:
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_bg)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _totals_box(rows: list[list[str]], accent: str = "#0f172a") -> Table:
    t = Table(rows, colWidths=[120 * mm, 50 * mm])
    t.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, -1), (-1, -1), 11),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor(accent)),
                ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor(accent)),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
            ]
        )
    )
    return t


def build_quote_pdf(quote: Any, settings: dict[str, str]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=12 * mm, bottomMargin=14 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings, "#0f172a"))
    body.append(Paragraph("TEKLİF", st["doc_title"]))
    cust = getattr(getattr(quote, "customer", None), "name", None) or "—"
    body.append(
        _meta_table(
            [
                ["Teklif No", str(quote.quote_number)],
                ["Müşteri", cust],
                ["Durum", str(quote.status)],
                ["Geçerlilik", str(quote.valid_until or "—")],
                ["Tarih", quote.created_at.strftime("%d.%m.%Y") if quote.created_at else "—"],
            ]
        )
    )
    body.append(Spacer(1, 10))

    rows = [["#", "Açıklama", "Adet", "Beden", "Renk", "Baskı", "Birim", "Tutar"]]
    for i, line in enumerate(quote.lines or [], 1):
        rows.append(
            [
                str(i),
                (line.description or "")[:42],
                str(line.quantity),
                line.size or "—",
                line.color or "—",
                line.print_type or "—",
                _money(line.unit_price),
                _money(line.line_total),
            ]
        )
    table = _data_table(
        rows,
        [8 * mm, 55 * mm, 12 * mm, 16 * mm, 16 * mm, 22 * mm, 22 * mm, 25 * mm],
        "#0f172a",
    )
    table.setStyle(TableStyle([("ALIGN", (2, 1), (-1, -1), "RIGHT")]))
    body.append(table)
    body.append(Spacer(1, 10))
    body.append(
        _totals_box(
            [
                ["İskonto", _money(quote.discount_amount)],
                ["Genel Toplam", _money(quote.total_amount)],
            ]
        )
    )
    if quote.notes:
        body.append(Spacer(1, 10))
        body.append(Paragraph(f"<b>Not:</b> {quote.notes}", st["body"]))
    body.append(Spacer(1, 8))
    body.append(Paragraph("Baykuş Baskı — teklif belgesi", st["small"]))
    doc.build(body)
    return buf.getvalue()


def build_work_order_pdf(order: Any, settings: dict[str, str]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=12 * mm, bottomMargin=14 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings, "#1e3a5f"))
    body.append(Paragraph("İŞ EMRİ", st["doc_title"]))
    cust = getattr(getattr(order, "customer", None), "name", None) or "—"
    delivery = order.delivery_date or order.due_date
    body.append(
        _meta_table(
            [
                ["Sipariş No", str(order.order_number)],
                ["Müşteri", cust],
                ["Durum", str(order.status)],
                ["Kanal", str(getattr(order, "channel", None) or "—")],
                ["Tasarım", str(getattr(order, "design_status", None) or "—")],
                ["Teslim", str(delivery or "—")],
            ]
        )
    )
    if getattr(order, "design_notes", None):
        body.append(Spacer(1, 4))
        body.append(Paragraph(f"<b>Tasarım notu:</b> {order.design_notes}", st["body"]))
    body.append(Spacer(1, 10))

    rows = [["#", "Açıklama", "Adet", "Beden", "Renk", "Baskı", "Birim", "Tutar"]]
    qty_sum = 0
    for i, line in enumerate(order.lines or [], 1):
        try:
            qty_sum += int(line.quantity or 0)
        except Exception:
            pass
        rows.append(
            [
                str(i),
                (line.description or "")[:42],
                str(line.quantity),
                line.size or "—",
                line.color or "—",
                line.print_type or "—",
                _money(line.unit_price),
                _money(line.line_total),
            ]
        )
    table = _data_table(
        rows,
        [8 * mm, 55 * mm, 12 * mm, 16 * mm, 16 * mm, 22 * mm, 22 * mm, 25 * mm],
        "#1e3a5f",
    )
    table.setStyle(TableStyle([("ALIGN", (2, 1), (-1, -1), "RIGHT")]))
    body.append(table)
    body.append(Spacer(1, 10))
    body.append(
        _totals_box(
            [
                ["Toplam adet", str(qty_sum)],
                ["Genel Toplam", _money(order.total_amount)],
            ],
            accent="#1e3a5f",
        )
    )
    if order.notes:
        body.append(Spacer(1, 8))
        body.append(Paragraph(f"<b>Not:</b> {order.notes}", st["body"]))
    body.append(Spacer(1, 20))
    sig = Table(
        [["Üretim: ____________________", "Kontrol: ____________________", "Teslim: ____________________"]],
        colWidths=[60 * mm, 60 * mm, 56 * mm],
    )
    sig.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8), ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#475569"))]))
    body.append(sig)
    body.append(Spacer(1, 8))
    body.append(Paragraph("Baykuş Baskı — iş emri (web PDF)", st["small"]))
    doc.build(body)
    return buf.getvalue()


def build_assets_report_pdf(rows: list[dict[str, Any]], settings: dict[str, str] | None = None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings or {}, "#0f766e"))
    body.append(Paragraph("Demirbaş Raporu", st["doc_title"]))
    total = sum(Decimal(str(r.get("current_value") or 0)) for r in rows)
    body.append(Paragraph(f"Toplam kayıt: {len(rows)} · Güncel değer: <b>{_money(total)}</b>", st["body"]))
    body.append(Spacer(1, 8))
    table_rows = [["Demirbaş", "Kategori", "Durum", "Değer", "Bakım"]]
    for r in rows[:200]:
        table_rows.append(
            [
                str(r.get("name") or "")[:36],
                str(r.get("category") or "")[:18],
                str(r.get("status") or "")[:12],
                _money(r.get("current_value")),
                str(r.get("maintenance_date") or "")[:12],
            ]
        )
    t = _data_table(table_rows, [55 * mm, 30 * mm, 25 * mm, 30 * mm, 28 * mm], "#0f766e")
    t.setStyle(TableStyle([("ALIGN", (3, 1), (3, -1), "RIGHT")]))
    body.append(t)
    body.append(Spacer(1, 8))
    body.append(_totals_box([["Kayıt", str(len(rows))], ["Toplam değer", _money(total)]], accent="#0f766e"))
    doc.build(body)
    return buf.getvalue()


def build_cari_statement_pdf(
    customer_name: str,
    rows: list[dict[str, Any]],
    closing_balance: Any,
    settings: dict[str, str] | None = None,
) -> bytes:
    """Cari ekstre / mutabakat PDF — header + logo + kapanış toplamı."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings or {}, "#1e3a5f"))
    body.append(Paragraph("Cari Mutabakat / Ekstre", st["doc_title"]))
    body.append(_meta_table([["Müşteri", str(customer_name)], ["Hareket", str(len(rows))], ["Kapanış", _money(closing_balance)]]))
    body.append(Spacer(1, 8))
    table_rows = [["Tarih", "Tip", "Borç", "Alacak", "Bakiye", "Not"]]
    debit_sum = Decimal("0")
    credit_sum = Decimal("0")
    for r in rows[:400]:
        try:
            debit_sum += Decimal(str(r.get("debit") or 0))
            credit_sum += Decimal(str(r.get("credit") or 0))
        except Exception:
            pass
        table_rows.append(
            [
                str(r.get("date") or "")[:10],
                str(r.get("type") or "")[:14],
                _money(r.get("debit")),
                _money(r.get("credit")),
                _money(r.get("balance")),
                str(r.get("note") or "")[:28],
            ]
        )
    t = _data_table(table_rows, [22 * mm, 28 * mm, 26 * mm, 26 * mm, 26 * mm, 42 * mm], "#1e3a5f")
    t.setStyle(TableStyle([("ALIGN", (2, 1), (4, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 7)]))
    body.append(t)
    body.append(Spacer(1, 10))
    body.append(
        _totals_box(
            [
                ["Toplam borç", _money(debit_sum)],
                ["Toplam alacak", _money(credit_sum)],
                ["Kapanış bakiyesi", _money(closing_balance)],
            ],
            accent="#1e3a5f",
        )
    )
    body.append(Spacer(1, 14))
    sig = Table(
        [["Müşteri imza: ____________________", "Firma imza: ____________________"]],
        colWidths=[90 * mm, 90 * mm],
    )
    sig.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8)]))
    body.append(sig)
    body.append(Spacer(1, 8))
    body.append(
        Paragraph(
            "Not: Web cari/mutabakat PDF — masaüstü ReportLab Cari Döküm şablonunun birebir kopyası değildir.",
            st["small"],
        )
    )
    doc.build(body)
    return buf.getvalue()


def build_price_list_pdf(list_name: str, rows: list[dict[str, Any]], settings: dict[str, str] | None = None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings or {}, "#0f766e"))
    body.append(Paragraph(f"Fiyat Listesi — {list_name}", st["doc_title"]))
    body.append(Paragraph(f"Kalem: <b>{len(rows)}</b>", st["body"]))
    body.append(Spacer(1, 8))
    table_rows = [["Ürün", "Tedarikçi", "Alış", "Baskısız", "Baskılı", "Nakışlı"]]
    for r in rows[:300]:
        table_rows.append(
            [
                str(r.get("description") or "")[:34],
                str(r.get("supplier_name") or "")[:18],
                _money(r.get("purchase_price")),
                _money(r.get("blank_price")),
                _money(r.get("printed_price")),
                _money(r.get("embroidered_price")),
            ]
        )
    t = _data_table(table_rows, [48 * mm, 30 * mm, 26 * mm, 26 * mm, 26 * mm, 26 * mm], "#0f766e")
    t.setStyle(TableStyle([("ALIGN", (2, 1), (-1, -1), "RIGHT")]))
    body.append(t)
    body.append(Spacer(1, 8))
    body.append(_totals_box([["Kalem sayısı", str(len(rows))], ["Liste", str(list_name)[:40]]], accent="#0f766e"))
    body.append(Spacer(1, 6))
    body.append(Paragraph("Baykuş Baskı — fiyat listesi (web PDF)", st["small"]))
    doc.build(body)
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
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=14 * mm, bottomMargin=14 * mm
    )
    st = _styles()
    body: list = []
    body.extend(_company_header(settings or {}, "#0f766e"))
    body.append(Paragraph("Borç-Alacak Fişi", st["doc_title"]))
    tip_color = "#0f766e" if "Alacak" in str(tip) else "#be123c"
    body.append(
        Paragraph(
            f'<font color="{tip_color}"><b>{tip}</b></font>',
            st["body"],
        )
    )
    body.append(Spacer(1, 8))
    rows = [
        ["Tedarikçi", str(supplier_name or "")],
        ["İşlem Tipi", str(tip or "")],
        ["İşlem Tarihi", str(movement_date or "")[:10]],
        ["Vade", str(due_date or "—")[:10]],
        ["Tutar", _money(amount)],
        ["Açıklama", str(note or "—")[:120]],
    ]
    t = Table(rows, colWidths=[40 * mm, 120 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#ecfdf5")),
                ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    body.append(t)
    body.append(Spacer(1, 12))
    body.append(
        Paragraph(
            "Bu fiş kasa/banka hareketi oluşturmaz; yalnızca tedarikçi cari bakiyesini düzenler.",
            st["body"],
        )
    )
    body.append(Spacer(1, 20))
    sig = Table(
        [["Hazırlayan: ____________________", "Onay: ____________________"]],
        colWidths=[90 * mm, 90 * mm],
    )
    sig.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8)]))
    body.append(sig)
    body.append(Spacer(1, 6))
    body.append(Paragraph("Baykuş Baskı — tedarikçi fişi (web PDF)", st["small"]))
    doc.build(body)
    return buf.getvalue()
