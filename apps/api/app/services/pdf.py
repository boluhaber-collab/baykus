"""ReportLab PDF builders for quotes and work orders."""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _money(v: Any) -> str:
    try:
        d = Decimal(str(v or 0))
    except Exception:
        d = Decimal("0")
    return f"{d:,.2f} ₺".replace(",", "X").replace(".", ",").replace("X", ".")


def _company_header(settings: dict[str, str]) -> list:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "CompanyTitle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=4,
        textColor=colors.HexColor("#0f172a"),
    )
    sub = ParagraphStyle(
        "CompanySub",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        spaceAfter=2,
    )
    name = settings.get("company_name") or "Baykuş Baskı"
    phone = settings.get("phone") or ""
    bits = [Paragraph(name, title)]
    if phone:
        bits.append(Paragraph(f"Tel: {phone}", sub))
    bits.append(Spacer(1, 8))
    return bits


def build_quote_pdf(quote: Any, settings: dict[str, str]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=6, spaceAfter=8)
    body = []
    body.extend(_company_header(settings))
    body.append(Paragraph("TEKLİF", h2))
    cust = getattr(getattr(quote, "customer", None), "name", None) or "—"
    meta = [
        ["Teklif No", quote.quote_number],
        ["Müşteri", cust],
        ["Durum", quote.status],
        ["Geçerlilik", str(quote.valid_until or "—")],
        ["Tarih", quote.created_at.strftime("%d.%m.%Y") if quote.created_at else "—"],
    ]
    t = Table(meta, colWidths=[40 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    body.append(t)
    body.append(Spacer(1, 10))

    rows = [["#", "Açıklama", "Adet", "Beden", "Renk", "Baskı", "Birim", "Tutar"]]
    for i, line in enumerate(quote.lines or [], 1):
        rows.append([
            str(i),
            (line.description or "")[:40],
            str(line.quantity),
            line.size or "—",
            line.color or "—",
            line.print_type or "—",
            _money(line.unit_price),
            _money(line.line_total),
        ])
    table = Table(rows, colWidths=[8 * mm, 55 * mm, 12 * mm, 18 * mm, 18 * mm, 22 * mm, 22 * mm, 25 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    body.append(table)
    body.append(Spacer(1, 10))
    totals = [
        ["İskonto", _money(quote.discount_amount)],
        ["Genel Toplam", _money(quote.total_amount)],
    ]
    tt = Table(totals, colWidths=[140 * mm, 40 * mm])
    tt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    body.append(tt)
    if quote.notes:
        body.append(Spacer(1, 12))
        body.append(Paragraph(f"<b>Not:</b> {quote.notes}", styles["Normal"]))
    doc.build(body)
    return buf.getvalue()


def build_work_order_pdf(order: Any, settings: dict[str, str]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=15 * mm, bottomMargin=15 * mm)
    styles = getSampleStyleSheet()
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=6, spaceAfter=8)
    body = []
    body.extend(_company_header(settings))
    body.append(Paragraph("İŞ EMRİ", h2))
    cust = getattr(getattr(order, "customer", None), "name", None) or "—"
    delivery = order.delivery_date or order.due_date
    meta = [
        ["Sipariş No", order.order_number],
        ["Müşteri", cust],
        ["Durum", order.status],
        ["Kanal", getattr(order, "channel", None) or "—"],
        ["Tasarım", getattr(order, "design_status", None) or "—"],
        ["Teslim", str(delivery or "—")],
    ]
    t = Table(meta, colWidths=[40 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    body.append(t)
    if getattr(order, "design_notes", None):
        body.append(Spacer(1, 6))
        body.append(Paragraph(f"<b>Tasarım notu:</b> {order.design_notes}", styles["Normal"]))
    body.append(Spacer(1, 10))
    rows = [["#", "Açıklama", "Adet", "Beden", "Renk", "Baskı", "Birim", "Tutar"]]
    for i, line in enumerate(order.lines or [], 1):
        rows.append([
            str(i),
            (line.description or "")[:40],
            str(line.quantity),
            line.size or "—",
            line.color or "—",
            line.print_type or "—",
            _money(line.unit_price),
            _money(line.line_total),
        ])
    table = Table(rows, colWidths=[8 * mm, 55 * mm, 12 * mm, 18 * mm, 18 * mm, 22 * mm, 22 * mm, 25 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    body.append(table)
    body.append(Spacer(1, 10))
    body.append(Paragraph(f"<b>Toplam:</b> {_money(order.total_amount)}", styles["Normal"]))
    if order.notes:
        body.append(Spacer(1, 8))
        body.append(Paragraph(f"<b>Not:</b> {order.notes}", styles["Normal"]))
    body.append(Spacer(1, 24))
    body.append(Paragraph("Üretim imza: ________________    Kontrol: ________________", styles["Normal"]))
    doc.build(body)
    return buf.getvalue()
