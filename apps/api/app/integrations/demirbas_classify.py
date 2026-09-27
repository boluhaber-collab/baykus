"""Heuristics: which stock/inventory titles are fixed assets (demirbaş), not sellable."""

from __future__ import annotations

import re
import unicodedata

# Known BizimHesap inventory orphan IDs that are machines (not sellable stock)
KNOWN_DEMIRBAS_BH_IDS = {
    "E72F4700F6A3403385CB0B2CC32CD37F",  # TRANSFER BASKI MAKİNASI
    "76FEDAD91B61426EA9F59B7F0494383D",  # ŞAPKA BASKI ÜNİTESİ
    "B2C81DB8C897424A9DBB78CD79861CFB",  # ÇİFT KUPA BARDAK BASKI MAKİNASI
    "76249931B8954570A8E748A15180DAE2",  # EPSON A3 FOTO YAZICI
    "57B8D50FC3834A5D914FF8EAFD583BB6",  # HOBİ PRES BASKI MALZ (user: demirbaş)
}

_MACHINE_RE = re.compile(
    r"("
    r"makina|makine|"
    r"yaz[ıi]c[ıi]|"
    r"fotog\.?\s*yaz|"
    r"[üu]nite|"
    r"pres[iı]?|"
    r"\bpres\b"
    r")",
    re.I,
)

# After fold(): consumables / pure service names to keep in stock
_KEEP_STOCK_RE = re.compile(
    r"("
    r"\b(malz|malzeme|kagit|sarf|murekkep)\b|"
    r"\bhizmet\b|"
    r"^transfer\s+baski$|"
    r"^uv\s+baski$|"
    r"transfer\s+kag"
    r")"
)

_WEAK_TOKENS = {
    "adet",
    "sistem",
    "baski",
    "the",
    "and",
    "cm",
    "li",
    "icin",
}

_NORM_SUBS = (
    ("yazicisi", "yazici"),
    ("fotog", "foto"),
    ("makinesi", "makine"),
    ("makinasi", "makine"),
    ("unitesi", "unite"),
)


def fold(s: str | None) -> str:
    t = (s or "").strip().casefold()
    t = (
        t.replace("ı", "i")
        .replace("İ", "i")
        .replace("ş", "s")
        .replace("ğ", "g")
        .replace("ü", "u")
        .replace("ö", "o")
        .replace("ç", "c")
    )
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip()


def significant_tokens(s: str | None) -> set[str]:
    f = fold(s)
    for a, b in _NORM_SUBS:
        f = f.replace(a, b)
    toks = set(re.findall(r"[a-z0-9]{3,}", f))
    return toks - _WEAK_TOKENS


def is_demirbas_title(title: str | None, bh_id: str | None = None) -> bool:
    """True if this inventory/product should live under Demirbaşlar, not stock."""
    if bh_id and bh_id.strip().upper() in KNOWN_DEMIRBAS_BH_IDS:
        return True
    name = (title or "").strip()
    if not name:
        return False
    folded = fold(name)
    if _KEEP_STOCK_RE.search(folded):
        # Explicit equipment still demirbaş even if name contains MALZ
        if re.search(r"makina|makine|yazici|unite|hobi\s+pres", folded):
            return True
        return False
    return bool(_MACHINE_RE.search(folded))


def names_match(a: str | None, b: str | None) -> bool:
    """True if two demirbaş/product names likely refer to the same asset."""
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return False
    if fa == fb:
        return True
    ta, tb = significant_tokens(a), significant_tokens(b)
    if not ta or not tb:
        return False
    inter = ta & tb
    if len(inter) >= 2:
        return True
    # Brand + machine class (EPSON … YAZICI ↔ EPSON L 18050 … YAZICISI)
    if "epson" in inter and "yazici" in ta and "yazici" in tb:
        return True
    if ("freesub" in ta or "fresub" in ta) and ("freesub" in tb or "fresub" in tb):
        if "makine" in ta | tb or "pres" in fa or "pres" in fb:
            return True
    return False
