# BizimHesap → Baykuş içe aktarma

Bu rehber **ürün / depo / stok** one-shot API importunu ve sonraki **cari (müşteri–tedarikçi) Excel** aşamasını açıklar.

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

## 3) Excel cari aşaması (faz 2 — hazırlık)

API’de ürün stok sync’i vardır; **müşteri / tedarikçi cari bakiyeleri** için Excel (veya ileride API) kullanılır. Bu görevde Excel dosyası beklenmez — aşağıdakileri BizimHesap’tan indirip saklayın.

### BizimHesap’tan indirilecekler (checklist)

- [ ] **Müşteri listesi** (cari kartlar) — Excel/CSV
- [ ] **Tedarikçi listesi** — Excel/CSV
- [ ] **Cari ekstre / hareket** (varsa: müşteri + tedarikçi bakiyeleri, açılış, borç/alacak)
- [ ] İsteğe bağlı: fiyat listeleri, cari yaşlandırma

Dosyaları `tmp/bizimhesap/excel/` altına koyabilirsiniz (gitignore’da `tmp/`).

### Baykuş’a aktarım (mevcut UI)

Web: **`/tools/import`** (Müşteri şablonu sekmesi) veya `POST /api/customers/import`.

#### Müşteri şablon sütunları (`/api/customers/import-template`)

| Sütun | Zorunlu | Not |
|-------|---------|-----|
| Ad | Evet | Müşteri ünvanı / ad |
| Firma | | |
| Telefon | | Eşleştirme anahtarı (varsa) |
| E-posta | | |
| Şehir | | |
| Adres | | |
| Vergi No | | VKN / TCKN |
| Vergi Dairesi | | |
| Kod | | Cari kod; yoksa telefon/ad ile eşleşir |
| Not | | |

BizimHesap export sütunlarını bu başlıklara yeniden adlandırın veya `/tools/import` alias’larına uyun (`name`, `company`, `phone`, `vkn`, …).

#### Tedarikçi

Şu an müşteri kadar olgun bir `/api/suppliers/import` yoksa:

1. Müşteri şablonunu örnek alıp aynı kolon mantığıyla tedarikçi satırlarını hazırlayın.
2. Veya UI’dan elle / sonraki fazda tedarikçi import endpoint’i eklenince aktarın.

Önerilen tedarikçi kolonları: **Ad, Firma, Telefon, E-posta, Şehir, Adres, Vergi No, Vergi Dairesi, Kod, Not**.

#### Cari ekstre → `cari_movements` / `supplier_movements`

Açılış bakiyesi için müşteri kartındaki `opening_balance` veya hareket satırları gerekir. Excel’de beklenen mantık:

| Tarih | Cari Kod/Ad | Tip (borç/alacak) | Tutar | Açıklama |
|-------|-------------|-------------------|-------|----------|
| … | … | Borç / Alacak | … | … |

Bu satırların otomatik import’u **faz 2**’dedir; şimdilik dosyayı arşivleyin.

## 4) Güvenlik

- Token, ham 1MB+ JSON dump’ları ve `*.db` **commit edilmez** (`tmp/`, `*.db`, `.env` gitignore’da).
- Import sonrası smoke: ürün sayısı, 3 depo, örnek `warehouse_stocks` satırları.

## 5) Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| HTTP 403 / Cloudflare 1010 | User-Agent eksik — script Chrome UA gönderir; eski curl’ü kullanmayın |
| `resultCode != 1` | Token yanlış veya süresi dolmuş |
| `BIZIMHESAP_TOKEN not found` | Env / `--token-file` / box-secrets |
| Postgres’e yazıyor | `DATABASE_URL=sqlite:///./baykus.db` verin (Windows yereli) |
