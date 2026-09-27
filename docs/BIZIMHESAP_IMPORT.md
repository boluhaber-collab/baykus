# BizimHesap → Baykuş içe aktarma

Bu rehber **ürün / depo / stok** API importunu, **cari (müşteri–tedarikçi list + Detaylı Ekstre PDF)** ve **Hesaplarım (kasa / banka / ortak)** aşamalarını açıklar.

## 1) Token alma

1. BizimHesap web panelinde **API / B2B** bölümünden hesabınıza özel **Token** oluşturun veya kopyalayın.
2. Public Key (sabit, tüm B2B istemcilerinde aynı):

   `BZMHB2B724018943908D0B82491F203F`

3. Token’ı güvenli saklayın — **asla git’e commit etmeyin**.

### Ortam değişkeni / dosya

| Kaynak | Nasıl |
|--------|--------|
| Env | `BIZIMHESAP_TOKEN=...` |
| Box secrets | `/home/box/agent-data/box-secrets.json` → `card.BIZIMHESAP_TOKEN` |
| Dosya | `--token-file path` (düz metin veya JSON) |

HTTP istekleri `Key` + `Token` header’ları ve **Chrome User-Agent** ile gider (Cloudflare 1010 engeli).

Base URL: `https://bizimhesap.com/api/b2b`

## 2) Ürün–depo–stok import (CLI)

### Linux / box

```bash
cd /path/to/baykus-web
./scripts/import-bizimhesap-stock.sh
# veya:
cd apps/api
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "sqlite:///./baykus.db"   # PowerShell
export DATABASE_URL=sqlite:///./baykus.db
export BIZIMHESAP_TOKEN=...                   # yoksa box-secrets okunur
python scripts/import_bizimhesap_stock.py
# eşdeğer: python -m app.scripts.import_bizimhesap_stock
```

### Windows PC (`C:\Users\engin\Desktop\baykus`)

```powershell
cd C:\Users\engin\Desktop\baykus\apps\api
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "sqlite:///./baykus.db"
$env:BIZIMHESAP_TOKEN = "<token>"   # veya --token-file
python scripts\import_bizimhesap_stock.py
```

Repo kökünden: `bash scripts/import-bizimhesap-stock.sh` (Git Bash) aynı işi yapar.

### Faydalı bayraklar

| Bayrak | Anlam |
|--------|--------|
| `--from-cache DIR` | Canlı API yerine `tmp/bizimhesap/*.json` kullan |
| `--cache-dir DIR` | Canlı çekince JSON önbelleğe yaz (gitignore’da) |
| `--dry-run` | Sadece çek / say; DB’ye yazma |
| `--skip-backup` | SQLite yedeğini atla |
| `--token-file PATH` | Token dosyası |

### Ne yapar?

1. SQLite `baykus.db` dosyasını `apps/api/backups/baykus_pre_bh_import_*.db` olarak yedekler.
2. **Siler / sıfırlar (wipe):**
   - `warehouse_stocks`, `stock_movements`, `product_variants`, `products`, `warehouses`
   - `order_lines` / `quote_lines` / `purchase_lines` / `price_list_items` üzerindeki `product_id` / `variant_id` → `NULL`
3. **Korur:** `users`, `roles`, `app_settings`, müşteriler, tedarikçiler, sipariş/finans kayıtları (ürün FK’leri null’lanır), cari hareketler, vb.
4. BizimHesap’tan çeker: `GET /products`, `/warehouses`, `/inventory/{id}`.
5. Depoları `code=BH:{id}`, ürün SKU `BH:{id}`, varyant SKU `BHV:…` ile yazar.
6. Envanteri `warehouse_stocks` + `stock_movements` (reason=`bizimhesap_import`) olarak uygular; `product.stock_qty` / `variant.stock_qty` depo toplamına eşitlenir.

**Idempotent:** Script her çalıştırmada önce wipe eder, sonra yeniden yükler — güvenli tekrar çalıştırılabilir (önce yedek alınır).

### Eşleme notları

- BH `/products` aynı `id` altında çok satır döner (her satır bir varyant: `variant` / `variantName`).
- Baykuş’ta bunlar **1 ürün + N varyant** olur (~94 ana ürün, ~3000 varyant satırı).
- Envanter satırı ürün `id` + başlıktaki varyant metni ile eşlenir.
- Ürün listesinde olmayan ama envanterde olan id’ler için “orphan” ürün oluşturulur.
- `price` → `base_price` (satış), `buyingPrice` → `purchase_price` + `cost`.
- Birim / KDV ürün modelinde yok → `description` içine `Birim=… | KDV=%… | BH_ID=…` yazılır.

## 3) Cari aşaması (müşteri / tedarikçi + Detaylı Ekstre PDF)

BizimHesap B2B API’sinde cari ekstre yok; **UI’dan** müşteri/tedarikçi listesi + parti başı **Detaylı Ekstre PDF** alınır.

### Kaynak dosyalar

`tmp/bizimhesap/ekstre/` (gitignore’da — **PDF’leri commit etmeyin**):

| Dosya | İçerik |
|-------|--------|
| `customer_list.xlsx` | Sütunlar: `Name`, `Guid`, `Statement file` |
| `supplier_list.xlsx` | Aynı |
| `customer_*.pdf` / `supplier_*.pdf` | Detaylı Ekstre (ör. `01.01.2015–27.09.2026`) |
| `manifest.json` | Export özeti |

Dosya adındaki 32 hex → BH GUID (`BH:{GUID}` cari kodu / not).

### Gereksinimler

- Python venv (`apps/api/.venv`) + `openpyxl`
- **`pdftotext`** (Poppler): Linux `poppler-utils`; Windows’ta Poppler binary PATH’te olmalı

### Linux / box

```bash
cd /path/to/baykus-web
./scripts/import-bizimhesap-cari.sh
# veya:
cd apps/api
source .venv/bin/activate
export DATABASE_URL=sqlite:///./baykus.db
python scripts/import_bizimhesap_cari.py
# eşdeğer: python -m app.scripts.import_bizimhesap_cari
# özel klasör:
python scripts/import_bizimhesap_cari.py --ekstre-dir ../../tmp/bizimhesap/ekstre
```

### Windows PC (`C:\Users\engin\Desktop\baykus`)

1. Ekstreleri kopyalayın (git’te yok):

   `C:\Users\engin\Desktop\baykus\tmp\bizimhesap\ekstre\`  
   (`customer_list.xlsx`, `supplier_list.xlsx`, PDF’ler, isteğe `manifest.json`)

2. Poppler / `pdftotext` kurulu olsun (PATH).

3. Çalıştırın:

```powershell
cd C:\Users\engin\Desktop\baykus\apps\api
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "sqlite:///./baykus.db"
python scripts\import_bizimhesap_cari.py
# veya:
python -m app.scripts.import_bizimhesap_cari
# dry-run (DB yazmaz):
python scripts\import_bizimhesap_cari.py --dry-run
```

Git Bash: `bash scripts/import-bizimhesap-cari.sh`

### Faydalı bayraklar

| Bayrak | Anlam |
|--------|--------|
| `--ekstre-dir DIR` | Master list + PDF klasörü (varsayılan `../../tmp/bizimhesap/ekstre`) |
| `--dry-run` | Sadece parse / sayım |
| `--skip-backup` | SQLite yedeğini atla |
| `--keep-demo` | Seed `M-00x` / `T-00x` demo carileri silme |

### Ne yapar?

1. `baykus.db` → `apps/api/backups/baykus_pre_bh_cari_*.db`
2. Varsayılan: seed demo carileri temizler (`M-00x` / `T-00x`; bağlı demo `purchases` de silinir; sipariş `customer_id` null’lanır)
3. Önceki `BH_IMPORT:…` etiketli `cari_movements` / `supplier_movements` satırlarını siler (**idempotent**)
4. XLSX → `Customer` / `Supplier` **upsert** (`code=BH:{guid}`, eşleşme: kod veya ad)
5. Her PDF → hareket satırları:
   - Müşteri: `cari_movements` (`sale` / `payment` / `adjustment`)
   - Tedarikçi: `supplier_movements` (`purchase` / `payment` / `adjustment`)
6. `opening_balance = 0`; bakiyeler hareketlerden gelir
7. Sipariş / alış / ödeme stub’u **oluşturulmaz** (temiz eşleme yok)

### PDF parse mantığı

- `pdftotext -layout`; satır: `Tarih Vade Hareket … Borç Alacak Bakiye`
- Tutarlar **Bakiye delta** ile türetilir (Açıklama içindeki fiyat/kur rakamlarına dayanıklı)
- Müşteri: Baykuş borç/alacak ≈ BH Borç/Alacak; bakiye aynı işaret
- Tedarikçi: Baykuş borç ≈ BH Alacak (borç↑), alacak ≈ BH Borç (ödeme); **Baykuş bakiye ≈ −BH bakiye**
- Not alanı: `BH_IMPORT:{guid}:{idx} | Hareket=… | Belge=… | [açıklama] | Kalem=NAME xQTY UNIT @PRICE=AMOUNT; … | BH_Bakiye=…`
- Satış/Alış PDF devam satırları (ürün/hizmet kalemleri) `Kalem=` olarak nota yazılır; müşteri/tedarikçi kart sol panelleri bu hareketleri listeler (Order/Purchase stub yok).

### Beklenen smoke (örnek kutu koşusu)

| Metrik | Değer |
|--------|--------|
| Müşteri | 37 |
| Tedarikçi | 13 |
| `cari_movements` | ~159 |
| `supplier_movements` | ~213 |
| Örnek | BAY FEROO bakiye `40.00`; SNN tedarikçi bakiye `17155.81` (BH ekstre sonu `-17155.81`) |

### Alternatif: UI Excel müşteri şablonu

Web **`/tools/import`** veya `POST /api/customers/import` hâlâ kullanılabilir (şablon sütunları: Ad, Firma, Telefon, …). Tedarikçi + ekstre için bu CLI tercih edilir.

## 4) Hesaplarım (kasa / banka / ortak)

BizimHesap B2B API’sinde kasa/banka **hareketi yok** (`GET /cashiers` yalnızca id+title listeler). Kaynak: panel **Hesaplarım** → hesap detayı DataTables endpoint’i:

`POST /web/services/json.asmx/GetCashTrx` (`guid=<hesap GUID>`, form-encoded DataTables params)

### Kaynak dosyalar

`tmp/bizimhesap/hesaplarim/` (gitignore — **xlsx/json commit etmeyin**):

| Dosya | İçerik |
|-------|--------|
| `banka_hesaplari.xlsx` | Hesap listesi (tür / kurum / ad / `BH-ACC-{GUID}`) |
| `banka_hareketleri.xlsx` | Banka + POS + KK + ortak hareketleri |
| `kasa_hareketleri.xlsx` | TL Kasa hareketleri |
| `per_account/*.json` | Hesap başı ham GetCashTrx satırları |
| `manifest.json` | Canlı bakiyeler, tarih aralığı, sayımlar |

### Dönem / canlı bakiyeler (scrape 27.09.2026 Europe/Istanbul)

Tam geçmiş (hesap başına ilk–son hareket). Örnek:

| Hesap | Tür | Canlı bakiye | Hareket |
|-------|-----|-------------:|--------:|
| TL Kasa | Kasa | 402,06 | 314 |
| Garanti Bankası | Banka | 1.687,39 | 430 |
| AKBANK | Banka | 1.582,93 | 101 |
| QNB KREDİ HESABI | Banka | 0,00 | 13 |
| VAKIFBANK | Banka | 0,00 | 74 |
| Banka TL Hesabı | Banka | 14.024,63 | 32 |
| FON HESABI | Banka | 0,00 | 12 |
| Vafıkbank (6972) | Kredi Kartı | −40.202,82 | 135 |
| Vakıfbank (0083) | Kredi Kartı | 0,00 | 197 |
| BAYKUŞ.COM | POS | 0,00 | 4 |
| POS Hesabı | POS | 0,00 | 0 |
| ENGİN (Engin KARAGÖZ) | Şirket Ortağı | **−768.011,78** | 64 |
| NEVİN (Nevin KARAGÖZ) | Şirket Ortağı | 81.589,67 | 23 |

> Not: Kullanıcı ekran görüntüsündeki TL Kasa ~2.155.087 / Garanti ~71.956 vb. canlı panel ile uyuşmuyordu; **Engin −768.011,78** canlı ile birebir. Import **canlı GetCashTrx** bakiyelerini hedefler (±0,01).

### Eşleme

| BH | Baykuş |
|----|--------|
| TL Kasa | `CashRegister` adı `TL Kasa` |
| Hesap Türü=`Banka` | `BankAccount.account_type=Banka` |
| `POS` / `Kredi Kartı` / `Şirket Ortağı` | aynı `account_type` |
| Borç / Alacak (panel) | Giriş / Çıkış → kasa `tahsilat`/`odeme`/`gider`/`transfer_*` — banka `deposit`/`withdrawal`/`fee`/`transfer_*` |
| Trx GUID | `notes = BH_IMPORT:BH-TRX:{guid} \| Hareket=… \| Cari=… \| …` |

UI: `/finance/banks/{id}` ve `/finance/cash/{id}` BizimHesap hesap detay düzeni (Bakiye + Güncelle/Para Girişi/Para Çıkışı/Transfer/Dökümanlar + Tarih|İşlem|Kullanıcı|Hesap|Açıklama|Borç|Alacak|Bakiye). Günlük kasa özeti `/finance/cash` ayrı kalır.

### Linux / box

```bash
cd /path/to/baykus-web
./scripts/import-bizimhesap-hesaplar.sh
# veya:
cd apps/api && source .venv/bin/activate
export DATABASE_URL=sqlite:///./baykus.db
python scripts/import_bizimhesap_hesaplar.py
python -m app.scripts.import_bizimhesap_hesaplar
```

### Windows PC

1. `tmp\bizimhesap\hesaplarim\` altına xlsx + `manifest.json` (+ isteğe `per_account/`) kopyalayın.
2. Çalıştırın:

```powershell
cd C:\Users\engin\Desktop\baykus\apps\api
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "sqlite:///./baykus.db"
python scripts\import_bizimhesap_hesaplar.py
```

### Faydalı bayraklar

| Bayrak | Anlam |
|--------|--------|
| `--hesap-dir DIR` | Kaynak klasör (varsayılan `../../tmp/bizimhesap/hesaplarim`) |
| `--dry-run` | Sadece parse / sayım |
| `--skip-backup` | SQLite yedeğini atla |
| `--keep-demo` | Seed bankaları / demo hareketleri silme |

### Ne yapar?

1. `baykus.db` → `apps/api/backups/baykus_pre_bh_hesaplar_*.db`
2. Varsayılan: tüm kasa/banka hareketlerini + banka hesaplarını siler; expense/loan FK null
3. `TL Kasa` + banka/POS/KK/ortak upsert (`notes` içinde `BH_IMPORT:BH-ACC:{GUID}`)
4. Hareketleri yazar; `opening_balance=0`; canlı bakiye = hareket toplamı
5. `manifest.json` bakiyeleri ile reconcile (±0,01)

### Canlı yeniden scrape (box)

Oturum çerezi gerekir (`uygulama.bizimhesap.com`). Hesap listesi `/web/ngn/acc/ngnaccounts`; hareketler `GetCashTrx`. Çıktıyı `tmp/bizimhesap/hesaplarim/` altına yazıp script’i yeniden çalıştırın.

### OOS / boşluklar

- **Banka EUR Hesabı**: B2B `/cashiers` listesinde; UI’da gizli, 0 hareket.
- Eski kısmi paket (01.07.2025–25.08.2026 Kasa Raporu) bakiyeleri bozuyordu — `hesaplarim_old_partial/` arşivinde.

## 5) Güvenlik

- Token, ham JSON dump’ları, ekstre PDF’leri, Hesaplarım xlsx ve `*.db` **commit edilmez** (`tmp/`, `*.db`, `.env` gitignore’da).
- Commit edilenler: `scripts/import_bizimhesap_*.py`, `app/scripts/…` sarmalayıcıları, `docs/BIZIMHESAP_IMPORT.md`, `scripts/import-bizimhesap-*.sh`.

## 6) Sorun giderme

| Belirti | Çözüm |
|--------|--------|
| HTTP 403 / Cloudflare 1010 | User-Agent eksik — stock script Chrome UA gönderir; eski curl’ü kullanmayın |
| `resultCode != 1` | Token yanlış veya süresi dolmuş |
| `BIZIMHESAP_TOKEN not found` | Env / `--token-file` / box-secrets |
| Postgres’e yazıyor | `DATABASE_URL=sqlite:///./baykus.db` verin (Windows yereli) |
| `pdftotext not found` | Poppler kurun; Windows PATH’e `pdftotext.exe` ekleyin |
| Cari bakiyeler kayıp / çift | Yeniden çalıştırın (BH_IMPORT hareketleri silinip yeniden yazılır); `--keep-demo` ile demo karışmasın |
| PDF’de satır kaçtı | `--dry-run` çıktısındaki `parse_unmatched_total` / `pdfs_continuity_warn`; best-effort — master list yine %100 yazılır |
| Kasa/banka demo kaldı | `--keep-demo` kullanmayın; script seed Ziraat/Garanti Ticari + demo hareketleri siler |
| Canlı bakiye ≠ Baykuş | `manifest.json` reconcile; GetCashTrx paketini yenileyin |
| `unmatched_bank_moves` > 0 | `banka_hareketleri` Hesap sütunu `banka_hesaplari` ile `Banka Adı - Hesap Adı` eşleşmeli |
| openpyxl yok | `pip install openpyxl` (apps/api venv) |
