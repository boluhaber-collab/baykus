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
| Sipariş Merkezi | `/orders` | done |
| Satışlar | `/sales` | done |
| Satış / Teklif Oluştur | `/sales/create` | done (Nakit/EFT/Kart/Veresiye, kapora/kalan, stok↓ + cari satış) |
| Perakende Satışlar | `/sales/retail` | done |
| Teklifler | `/quotes` | done |
| Sipariş Listesi | `/orders` | done |
| Teslim Edilen Siparişler | `/orders?status=Teslim%20Edildi` | done |
| Teslim Takibi | `/orders/delivery` | done |
| Sipariş Yaşam Çizgisi | `/orders/kanban` | done |

## Üretim / Atölye
| Masaüstü | Web | Durum |
|----------|-----|-------|
| Üretim Akış Paneli | `/production` | done |
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

Revizyon: Alembic **011** (`sublimation_print_times`, `documents.archive_tag`). SQLite: `python -m app.bootstrap_sqlite`.
