# BizimHesap ↔ Baykuş reconciliation — 2026-09-27 (Europe/Istanbul)

Refreshed live GetCashTrx for all Hesaplarım accounts; re-imported; cari smoke + spot-checks.

## Hesaplarım balance table

| Hesap | Tür | BH canlı | Baykuş | Δ | BH moves | Baykuş moves | Status |
|-------|-----|--------:|-------:|--:|--------:|-------------:|--------|
| TL Kasa | Kasa | 402,06 | 402,06 | 0,00 | 314 | 311 | OK |
| BAYKUŞ.COM | POS | 0,00 | 0,00 | 0,00 | 4 | 4 | OK |
| POS Hesabı | POS | 0,00 | 0,00 | 0,00 | 0 | 0 | OK |
| Vafıkbank (6972) | Kredi Kartı | −40.202,82 | −40.202,82 | 0,00 | 135 | 135 | OK |
| Vakıfbank (0083) | Kredi Kartı | 0,00 | 0,00 | 0,00 | 197 | 197 | OK |
| AKBANK | Banka | 1.582,93 | 1.582,93 | 0,00 | 101 | 101 | OK |
| Garanti Bankası | Banka | 1.687,39 | 1.687,39 | 0,00 | 430 | 430 | OK |
| QNB KREDİ HESABI | Banka | 0,00 | 0,00 | 0,00 | 13 | 13 | OK |
| VAKIFBANK | Banka | 0,00 | 0,00 | 0,00 | 74 | 74 | OK |
| ENGİN | Şirket Ortağı | **−768.011,78** | **−768.011,78** | 0,00 | 64 | 64 | OK |
| NEVİN | Şirket Ortağı | 81.589,67 | 81.589,67 | 0,00 | 23 | 23 | OK |
| FON HESABI | Banka | 0,00 | 0,00 | 0,00 | 12 | 12 | OK |
| Banka TL Hesabı | Banka | 14.024,63 | 14.024,63 | 0,00 | 32 | 32 | OK |

`reconcile_ok: True` after `import_bizimhesap_hesaplar.py`.

### Movement deltas explained

- **TL Kasa 314 → 311**: 3 zero-amount GetCashTrx rows skipped (`skipped_zero_amount=3`); balances unaffected.
- All other accounts: BH-TRX GUID set match 1:1 (hyphen form `BH_IMPORT:BH-TRX-{GUID}`).
- Live scrape 19:10 TR vs prior 17:51: **identical** row sets / balances (no new panel activity).

### Mismatch list

*(empty — all accounts within 0,01 TL)*

## Cari smoke

| Metrik | Değer | Status |
|--------|------:|--------|
| Müşteri | 37 | OK |
| Tedarikçi | 13 | OK |
| `cari_movements` | 159 (sale 73 / payment 85 / adjustment 1) | OK |
| `supplier_movements` | 213 (purchase 126 / payment 67 / adjustment 20) | OK |

### Spot-checks

| Party | Baykuş bakiye | BH ekstre | Status |
|-------|-------------:|----------:|--------|
| BAY FEROO (müşteri) | 40,00 | 40,00 | OK |
| SNN (tedarikçi) | 17.155,81 | −17.155,81 (Baykuş ≈ −BH) | OK |
| TEKNOFİNAL (tedarikçi) | 0,00 | 0,00 | OK |
| ENGİN ortak | −768.011,78 | −768.011,78 | OK |
| TL Kasa | 402,06 | 402,06 | OK |
| Garanti Bankası | 1.687,39 | 1.687,39 | OK |

Cross-link: BAY FEROO 26.09.2026 Tahsilat 1.200 Banka appears on **Garanti** deposit + **cari payment** same day/amount.

SNN: 109 Baykuş rows vs ~147 PDF dated lines — kalem continuation / zero stubs; **balance match** is success criterion. One supplier zero-amount row retained from PDF parse.

## OOS / gaps

- **Banka EUR Hesabı**: B2B `/cashiers` only; hidden on Hesaplarım UI; 0 movements — not imported.
- **FON HESABI / Banka TL Hesabı**: not listed on ngnaccounts cards; still scraped via known GUID + GetCashTrx (counterparty / legacy); balances 0,00 / 14.024,63.
- Perakende Satışlar cash tahsilatlar: no matching `cari_movements` (BH group account, not a customer card) — expected.

## Pipeline

- Live scrape: `apps/api/scripts/scrape_bizimhesap_hesaplarim.py` / `scripts/scrape-bizimhesap-hesaplarim.sh`
- Import: `python scripts/import_bizimhesap_hesaplar.py`
- Cache: `tmp/bizimhesap/hesaplarim/` (gitignore)

