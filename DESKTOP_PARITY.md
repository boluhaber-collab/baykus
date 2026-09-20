# Masaüstü → Web Parite Kontrol Listesi

Kaynak: `codex-baykus_program.py` `menu_tanimlari` + `modul_items` (Codex masaüstü prototipi).

Her satır: **Masaüstü yaprak** → **Web rota** → durum.

## Ana Sayfa
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ana Sayfa | `/dashboard` | done — masaüstü ana_sayfa: KPI şerit, hızlı işlemler, atölye, varlıklar, borç/alacak, uyarılar, stok tablosu, notlar |

## Müşteri Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Müşteri Merkezi (tek) | `/customers` hub — özet kartlar + büyük İşlemler düğmeleri | done |
| Müşteri Listesi / Yeni / Takip / Açık Alacaklar | hub CTA → `/customers`, `/customers/new`, `/customers/track`, `/customers/receivables` | done |
| Sidebar | tek satır (alt yaprak yok; masaüstü `tek`) | done |

## Tedarik Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Tedarik Merkezi (tek) | `/suppliers` hub — özet + İşlemler | done |
| Tedarikçiler / Alış / Borç-Alacak / Ödeme / Satın Alma | `#0f766e/#198754/#7c3aed/#334155/#be123c` hub CTA | done |
| Sidebar | tek satır | done |

## Ürün & Stok Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ürün & Stok Merkezi (tek) | `/products` hub — özet + İşlemler (6+Depolar) | done |
| Ürün Yönetimi / Kartlar / Stok / Kritik / Rapor / Hızlı Varyant / Depolar | masaüstü renkleri; Depolar → `/stock/warehouses` (+ transfer) | done |
| Sidebar | tek satır | done |

## Satış / Sipariş
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Sipariş Merkezi | `/orders` | done (sekmeler: Teklifler/Siparişler/Açık/Hazırlanıyor/Baskıda/Hazır/Teslim + Kanban; satır renkleri; toplu durum; teklif→sipariş) |
| Satışlar (= Direkt Satışlar) | `/sales` | done — hub değil; özet kartlar + 3 CTA + filtre + tablo; iptal→stok iade |
| Satış / Teklif Oluştur | `/sales/create` | done (batch 12: varyant/depo picker + warehouse_stocks; beden/renk/baskı; kapora/stok↓) |
| Perakende Satışlar | `/sales/retail` | done |
| Perakende Satış Gir | `/sales/retail/new` | done — masaüstü `perakende_satis_gir`; kayıt→stok↓ + kasa/banka |
| Teklifler | `/quotes` | done |
| Sipariş Listesi | `/orders` | done |
| Teslim Edilen Siparişler | `/orders?status=Teslim%20Edildi` | done |
| Teslim Takibi | `/orders/delivery` | done |
| Haftalık Plan | `/orders/weekly-plan` | done (batch 12; StatusFooter) |
| Sipariş Yaşam Çizgisi | `/orders/kanban` | done |

## Üretim / Atölye
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Üretim Akış Paneli | `/production` | done (atölye ilerlet → sonraki durum, satır renkleri, iş emri PDF) |
| İş Emirleri | `/production/work-orders` | done |
| Sublimasyon Baskı Süreleri | `/production/sublimation` | done |
| Teslim Alarmı | `/orders/delivery-alarm` | done |
| Geciken İşler | `/orders/overdue` | done |

## E-Ticaret
| Masaüstü | Web | Durum |
|----------|-----|-------|
| İnternet Satışları | `/ecommerce` | done (platform filtre + toplamlar) |

## Finans
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Günlük Kasa | `/finance/cash` | done (batch 10 maliyet/kâr gerçek maliyet) |
| Açık Bakiyeler | `/finance/open-balances` | done |
| Hesaplarım | `/finance/banks` | done |
| Krediler | `/finance/loans` + detay | done (batch 10 ödeme planı/alarm/Ödeme Yap) |
| Masraflar | `/finance/expenses` | done |
| Demirbaşlar | `/finance/assets` | done (batch 10 demirbaş alanları + PDF) |

## Fiyat / Maliyet
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Fiyat Listesi | `/price-lists` | done |
| DTF Maliyet Hesaplama | `/tools/dtf` | done |
| Maliyet Yönetimi | `/tools/costs` | done |
| Son Alış Fiyatları | `/tools/last-purchase-prices` | done |

## Raporlar
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Belge Arşiv Merkezi | `/reports/archive` | done |
| Kâr Analizi | `/reports/profit` | done (masaüstü panel dili) |
| Masraflar (rapor) | `/reports/expenses` | done |
| Cari Dökümler | `/reports/cari-statements` | done (CSV + basit PDF + HTML yazdır) |
| Satış Raporu | `/reports/sales` | done |
| Alış Raporu | `/reports/purchases` | done |

## Müşteri İletişim
| Masaüstü | Web | Durum |
|----------|-----|-------|
| İletişim Merkezi | `/communication` | done |
| WhatsApp Takip | `/whatsapp/track` | done (batch 10 aday+şablon+wa.me) |
| Özel Gün / Kampanya | `/crm/special-days` (+ `/crm/campaigns`) | done |
| WhatsApp Taslakları | `/whatsapp` | done |
| WhatsApp Geçmişi | `/whatsapp?tab=history` | done (hub) |
| Fihrist | `/directory` | done (batch 10 sekmeler/senkron/düzenle) |

## Evrak Dolabı
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Evrak Dolabı | `/documents` | done |

## Sistem
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ayarlar | `/settings` sekmeli (Genel/Hızlı İşlemler/Sol Menü/Varyant/Şablon/Kullanıcılar/Entegrasyonlar/Yedek/Sistem/YARDIM) | done |
| Yetki / Kilit Modu | `/settings/lock-mode` | done |
| Kullanıcı Yönetimi | `/settings?tab=kullanicilar` | done |
| İşlem Geçmişi | `/settings/audit` | done |
| Yedekleme | `/settings/backups` | done |
| Yedek Test Et | `/settings/backups` (Yedek Test Et düğmesi) | done |
| Sistem Sağlık Merkezi | `/settings/health` | done |
| Merkezi DB / VPS | `/settings/database` | done (host alanları; şifre yok) |
| Kullanıcı Değiştir | `/settings` (Kullanıcı Değiştir) / logout | done |

## Satış yan etkileri (order_flow)
| Özellik | Durum |
|---------|-------|
| Sipariş kayıtta stoklu varyant/ürün stok düşümü | done |
| Cari satış hareketi (borç) | done |
| Kapora → cari alacak + kasa tahsilat | done |
| Nakit/EFT/Kart/Veresiye ödeme tipleri | done |
| EFT/Kart → varsayılan banka hareketi | done |

## Bilinçli olarak webde olmayan / imkânsız
| Öğe | Neden |
|-----|-------|
| BizimHesap canlı sırlar / DPAPI | Yasak — sadece iskelet ayar JSON |
| Selenium / WhatsApp Desktop otomasyonu | Yasak — `wa.me` link + taslak |
| Cari Döküm PDF (ReportLab masaüstü aynısı) | Basit web PDF + yazdırılabilir HTML + CSV var; masaüstü ReportLab twin değil |
| Merkezi DB’ye SQLite aktarım / canlı Postgres şifresi | Şifre saklanmaz; host alanları ayarda |
| OneDrive / Windows yerel yollar | Web sunucu yedek zip |


## Derinleştirme — Satış/Teklif & Sipariş Merkezi (masaüstü `siparis_merkezi` / `siparis_detay` / `satis_teklif`)

| Özellik | Web | Durum |
|---------|-----|-------|
| Sipariş Merkezi notebook sekmeleri | `/orders` Teklifler · Siparişler · Açık · Hazırlanıyor · Baskıda · Hazır · Teslim | done |
| Satır renk etiketleri (teklif/acik/geciken/hazir/teslim) | `orderRowTag` / `orderRowTagClass` | done |
| Toplu durum güncelleme | `POST /api/orders/bulk-status` + çoklu seçim | done |
| Teklif → Sipariş (merkez sekmesi) | Teklifler sekmesi «Siparişe Çevir» → `POST /api/quotes/{id}/convert` | done |
| Tasarım Onay Akışı (durum/tarih/not) | Sipariş detay paneli + `PATCH /api/orders/{id}/design` | done |
| Tasarım durumları (masaüstü) | Bekliyor · Onay İstendi · Onaylandı · Revizyon İstendi · Revize Edildi · İptal | done |
| WhatsApp hızlı link (taslak) | Detayda şablon butonları → `/api/whatsapp/preview` + `wa.me` (Selenium yok) | done |
| İş emri PDF + tahsilat + yaşam çizgisi | Aynı detay ekranı | done |
| Kapora / kalan / ödeme tipi → finans | Satış oluştur + detay tahsilat (kasa/varsayılan banka) | done |

Revizyon: Alembic **012** (`design_approved_at`, `design_whatsapp_at`, design_status etiket remap). SQLite: `python -m app.bootstrap_sqlite`.

## Direkt Satışlar / Perakende (batch 6 — UI parity)

| Özellik | Web | Durum |
|---------|-----|-------|
| `/sales` = Direkt Satışlar (`satis_belgeleri_paneli` → `direkt_satislar_penceresi`) | hub kartlar kaldırıldı | done |
| Breadcrumb Satışlar › Direkt Satışlar | `crumbsForPath` | done |
| Perakende Gir breadcrumb Satışlar › Direkt Satışlar › Perakende Satış | `/sales/retail/new` | done |
| Özet: Listelenen / Toplam / Tahsil / İptal | `#198754/#be123c/#0f766e/#f59e0b` | done |
| CTA: Perakende / Yeni / Kayıtlı | `/sales/retail/new`, `/sales/create?type=…` | done |
| İptalde stok iade + finans temizliği | `DELETE /api/orders/{id}?soft=true` | done |
| Sidebar navy `#1b2230` | Sidebar + theme tokens | done |
| Dashboard payables + top seller | `DashboardSummary.payables_total`, `top_selling_product` | done |

Spec: `docs/DIRECT_SALES_SPEC.md` · ekran görüntüleri: `docs/parity-shots/`

## Hub + Ayarlar (batch 7 — tek merkez UX)

| Özellik | Web | Durum |
|---------|-----|-------|
| Sidebar `tek` hub'lar | Müşteri / Tedarik / Ürün&Stok / Evrak — tek satır, alt liste yok | done |
| Hub İşlemler büyük düğmeler | `HubActionsBar` — masaüstü `modern_button` boyutu/renkleri | done |
| Müşteri Merkezi CTA | Listesi · Yeni · Takibi · Açık Alacaklar | done |
| Tedarik Merkezi CTA | Tedarikçiler · Alış · Borç/Alacak · Ödeme · Satın Alma | done |
| Ürün & Stok CTA | Yönetim · Kartlar · Stok · Kritik · Rapor · Hızlı Varyant · Depolar | done |
| `/settings` sekmeler | Genel · **Hızlı İşlemler** · **Sol Menü Sıralaması** · **Varyant Yönetimi** · **Şablon Yönetimi** · Kullanıcılar · Entegrasyonlar · Yedek · Sistem · YARDIM | done |
| Ayar kaydı (non-secret) | `PUT /api/settings/app` — firma/tema/PG + hizli_islemler + sol_menu_* + teklif_sablon_* | done |
| API key / BizimHesap sırları | commit edilmez; `/settings/integrations` ayrı; PUT filtresi | done |
| Dashboard notlar | `GET/PUT /api/dashboard/notes` (AppSetting JSON) | done |
| Perakende varyant seçici | çoklu varyantta modal picker | done |
| Hızlı İşlemler → Ana Sayfa | seçili anahtarlar dashboard şeridine yansır | done |
| Sol Menü sıra/başlık | Sidebar `orderNavGroups` + localStorage | done |
| Varyant kataloğu | `GET/POST/PUT/DELETE /api/settings/variants` | done |
| Depolar Arası Transfer | `POST /api/stock/warehouses/transfer` + `warehouse_stocks` bakiyesi | done |

## Batch 8 — Ayarlar sekmeleri + Depo transfer (2026-09-20)

| Özellik | Web | Durum |
|---------|-----|-------|
| Hızlı İşlemler sekmesi | katalog checkbox; sabit `alis_hareketleri` | done |
| Sol Menü Sıralaması | yukarı/aşağı/başlık değiştir; kaydet | done |
| Varyant Yönetimi | Tür/Değer/Not CRUD | done |
| Şablon Yönetimi | teklif alanları + canlı önizleme | done |
| Depolar Arası Transfer UI | modal: Ürün/Varyant · Hedef Depo · Miktar · Transferi Tamamla | done |
| Per-depo stok | `warehouse_stocks` (SQLite create_all / Alembic 013) | done |
| BizimHesap canlı sync | stub — Selenium/DPAPI yok; etiketli disabled | stub |
| WhatsApp Desktop Selenium | stub — sadece `wa.me` + taslak | stub |
| DPAPI yedek şifresi | stub — web zip yedek | stub |



## Batch 9 — Finans + Üretim + ince stub derinleştirme (2026-09-20)

| Özellik | Web | Durum |
|---------|-----|-------|
| Günlük Kasa masaüstü özet | `/finance/cash` — Kasa Özeti kartları + sipariş tablosu + Kasa/Banka hareketleri (Giriş/Çıkış) · `GET /api/finance/cash/daily` | done |
| Açık Bakiyeler sipariş satırları | `/finance/open-balances` — Ara/Durum filtre · geciken/teslim satır renkleri · cari sekmesi | done |
| Hesaplarım tür grupları | `/finance/banks` — Banka/POS/Kart/Ortak paneller + kasa devir · `account_type`/`institution` | done |
| Masraflar masaüstü filtre | `/finance/expenses` — dönem · Ödenmiş/Ödenecek/Gecikmiş · belge/vade · kalem CRUD | done |
| Krediler / Demirbaşlar | mevcut CRUD korunur (özet kartlar önceki batch) | done |
| Üretim aşama sütunları | `/production` — stage chips + kanban sütunları + ilerlet/PDF | done |
| İş Emirleri | `/production/work-orders` — filtre · seçimli PDF · ilerlet | done |
| Teslim Alarmı / Geciken | `/orders/delivery-alarm`, `/orders/overdue` — özet + WA + PDF + gecikme günü | done |
| Açık Alacaklar (stub→ekran) | `/customers/receivables` — sipariş + cari sekmeleri (re-export kaldırıldı) | done |
| Açık Borçlar (stub→ekran) | `/suppliers/payables` — arama · CTA · ekstre | done |
| İletişim hub | `/communication` — canlı sayaçlar (WA kuyruk + fihrist) | done |
| WhatsApp Takip | `/whatsapp/track` — 3 kuyruk (Selenium yok) | done |
| İnternet Satışları | `/ecommerce` — kanal chip · tahsil/kalan kartları | done |
| Raporlar (masraf/alış/cari/arşiv) | filtre + CSV (auth) + özet kartlar; arşiv sil | done |
| Fiyat Listesi | `/price-lists` — özet kartlar + ara + aktif filtre | done |
| Evrak Dolabı | `/documents` — upload/list/delete (önceki) | done |

API: Alembic **014** (`bank_accounts.account_type/institution`, `expenses.due_date/document_no`). SQLite: `python -m app.bootstrap_sqlite` kolon yamaları.

Spec: `docs/FINANCE_PROD_SPEC_SNIPPETS.md`

Bilinçli boşluklar (karşılaştırmalı kontrol için): BizimHesap canlı sync, Selenium WA Desktop, DPAPI, cari PDF masaüstü ReportLab twin (web basit PDF/HTML/CSV var).


## Batch 10 — kalan kullanılabilir boşluklar (2026-09-20)

| Özellik | Web | Durum |
|---------|-----|-------|
| Kasa Özeti Maliyet | `GET /api/finance/cash/daily` — satır maliyeti = ürün `cost` veya `purchase_price` × adet; Brüt/Net + sipariş satırı Maliyet/Kâr | done |
| Krediler ödeme planı | `/finance/loans` kart listesi (KALAN / BU AY / geciken) + detay ÖDEME TARİHLERİ · **Ödeme Yap** → kasa/banka · son ödeme alarmı | done |
| Demirbaşlar | `/finance/assets` — Seri No · Güncel Değer · Durum · Bakım · filtre · **PDF Rapor** (`/api/finance/assets/report/pdf`) | done |
| Fihrist | `/directory` — Müşteri / Tedarikçi / Kişi sekmeleri · Yenile/Senkron · arama · düzenle | done |
| WhatsApp Takip | `/whatsapp/track` — aday listesi · tür filtresi · şablon · önizleme · **wa.me** (Selenium yok) | done |
| Cari PDF | `/reports/cari-statements` — CSV + basit ReportLab PDF + yazdırılabilir HTML (`format=pdf|html`) | done (not twin) |
| Sistem derinleştirme | Kilit Modu yardım metinleri · Sağlık Merkezi sekmeler/SQLite satır · Merkezi DB checklist · İşlem Geçmişi etiketi | done |

API: Alembic **015** (`assets.serial_no/current_value/status/maintenance_date`). SQLite: `python -m app.bootstrap_sqlite` kolon yamaları.

Hâlâ bilinçli dışı: BizimHesap canlı, Selenium WA Desktop, DPAPI, masaüstü ReportLab Cari/Demirbaş twin stil.


## Batch 11 — Hızlı satış / Fiyat / DTF / Kampanya / Takip / Sublimasyon (2026-09-20)

| Özellik | Web | Durum |
|---------|-----|-------|
| Hızlı satış `?type=yeni` / `?type=kayitli` | `/sales/create` — diyaloğa yakın başlıklar · müşteri ara/yeni · ürün satırları · kapora/ödeme tipi · kayıt→stok+finans (`deposit_amount`) | done |
| Direkt Satışlar CTA | `/sales` → `type=yeni` / `type=kayitli` | done |
| Fiyat Listesi kalem alanları | baskısız / baskılı / nakışlı / alış / tedarikçi · düzenle modal · Yazdır HTML · CSV · PDF | done |
| DTF Maliyet (masaüstü) | `/tools/dtf` Metretül · $/mt · kur → USD/TL kâr/marj · ayar persist · **Maliyete Aktar** | done |
| Maliyet Yönetimi | kategori preset · 5 kalem hızlı giriş · özet kartlar · `/api/tools/costs/bulk` | done |
| Son Alış Fiyatları | alış belgesi + ürün kartı yedek · CSV · kart/satış kolonları | done |
| Özel Gün / Kampanya | `/crm/special-days` CRUD+filtre · `/crm/campaigns` + **toplu wa.me** (`POST /api/crm/bulk-wa`, Selenium yok) | done |
| Müşteri Takibi | `/customers/track` timeline · alacaklar · notlar · müşteri filtresi | done |
| Sublimasyon Baskı Süreleri | Ürün / Baskı Süresi (metin) / Diğer Talimatlar · arama · `duration_text` | done |

API: Alembic **016** (`price_list_items` baskılı alanlar, `sublimation_print_times.duration_text`). SQLite: `python -m app.bootstrap_sqlite` kolon yamaları.

Hâlâ bilinçli dışı: BizimHesap canlı, Selenium WA Desktop, DPAPI.


## Batch 12 — TS noise + Hızlı satış varyant/depo + Haftalık Plan + SAT talep + Teklif şartları (2026-09-20)

| Özellik | Web | Durum |
|---------|-----|-------|
| TS: `.casefold` | `/finance/open-balances` → `toLocaleLowerCase("tr")` | done |
| TS: WA `customer_id` | `/whatsapp/track` Candidate tipine eklendi | done |
| TR lowercasing | hızlı satış / WA track / açık bakiyeler | done |
| Hızlı satış varyant/depo | `/sales/create` — Perakende modal parity; beden/renk/depo; `warehouse_stocks` stok kontrolü | done |
| Haftalık Plan | `/orders/weekly-plan` + `GET /api/dashboard/weekly-plan` · StatusFooter/dashboard alt çubuk | done |
| Satın Alma Talebi | `/purchases/new` — kritik stok seçim · talep adedi · satın almaya dönüştür (+ manuel sekme) | done |
| Teklif şartları | `/quotes/new` + `/quotes/[id]` — Şablon Yönetimi alanları (sartlar/kapanış/başlık) | done |
| İnce hub kalınlaştırma | `/stock/critical`, `/orders/delivery`, `/payables`, `/communication`, `/orders/[id]/timeline` | done |

API: `CriticalStockItem` + supplier/purchase/size/color/print; weekly-plan dashboard endpoint. Alembic yok.

Hâlâ bilinçli dışı: BizimHesap canlı, Selenium WA Desktop, DPAPI.
