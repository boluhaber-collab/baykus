# Masaüstü → Web Parite Kontrol Listesi

Kaynak: `codex-baykus_program.py` `menu_tanimlari` + `modul_items` (Codex masaüstü prototipi).

Her satır: **Masaüstü yaprak** → **Web rota** → durum.

## Ana Sayfa
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ana Sayfa | `/dashboard` | done |

## Müşteri Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Müşteri Merkezi (tek) | `/customers` | done |
| Müşteri Listesi / Yeni / Takip / Açık Alacaklar | `/customers`, `/customers/new`, `/customers/track`, `/customers/receivables` | done |

## Tedarik Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Tedarik Merkezi | `/suppliers` | done |
| Tedarikçiler / Alış Hareketleri / Borç-Alacak / Satın Alma Talebi | `/suppliers`, `/purchases`, `/suppliers/payables`, `/purchases/new` | done |

## Ürün & Stok Merkezi
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ürün & Stok Merkezi | `/products` | done |
| Ürün Yönetimi / Kartlar / Stok / Kritik / Stok Raporu / Depolar | `/products`, `?tab=variants`, `/stock`, `/stock/critical`, `/reports/stock`, `/stock/warehouses` | done |

## Satış / Sipariş
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Sipariş Merkezi | `/orders` | done (sekmeler: Teklifler/Siparişler/Açık/Hazırlanıyor/Baskıda/Hazır/Teslim + Kanban; satır renkleri; toplu durum; teklif→sipariş) |
| Satışlar | `/sales` | done |
| Satış / Teklif Oluştur | `/sales/create` | done (beden/renk/baskı, ürün ekle, teslim tarihi, kapora/kalan, Nakit→kasa / EFT·Kart→banka, stok↓) |
| Perakende Satışlar | `/sales/retail` | done |
| Teklifler | `/quotes` | done |
| Sipariş Listesi | `/orders` | done |
| Teslim Edilen Siparişler | `/orders?status=Teslim%20Edildi` | done |
| Teslim Takibi | `/orders/delivery` | done |
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
| Günlük Kasa | `/finance/cash` | done (bugün varsayılan + açılış bakiyesi) |
| Açık Bakiyeler | `/finance/open-balances` | done |
| Hesaplarım | `/finance/banks` | done |
| Krediler | `/finance/loans` | done |
| Masraflar | `/finance/expenses` | done |
| Demirbaşlar | `/finance/assets` | done |

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
| Cari Dökümler | `/reports/cari-statements` | done (CSV; PDF masaüstü-native) |
| Satış Raporu | `/reports/sales` | done |
| Alış Raporu | `/reports/purchases` | done |

## Müşteri İletişim
| Masaüstü | Web | Durum |
|----------|-----|-------|
| İletişim Merkezi | `/communication` | done |
| WhatsApp Takip | `/whatsapp/track` | done |
| Özel Gün / Kampanya | `/crm/special-days` (+ `/crm/campaigns`) | done |
| WhatsApp Taslakları | `/whatsapp` | done |
| WhatsApp Geçmişi | `/whatsapp?tab=history` | done (hub) |
| Fihrist | `/directory` | done |

## Evrak Dolabı
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Evrak Dolabı | `/documents` | done |

## Sistem
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Ayarlar | `/settings` | done |
| Yetki / Kilit Modu | `/settings/lock-mode` | done |
| Kullanıcı Yönetimi | `/settings` | done |
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
| Cari Döküm PDF (ReportLab masaüstü aynısı) | Web CSV/ekstre; PDF iskeleti sipariş iş emrinde var |
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

