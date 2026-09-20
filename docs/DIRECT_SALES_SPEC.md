# Direkt Satışlar / Perakende / Ana Sayfa — masaüstü birebir spec

## Satışlar = Direkt Satışlar
`satis_belgeleri_paneli()` → `direkt_satislar_penceresi()`
Yol: `Satışlar › Direkt Satışlar`

### Özet kartları
- Listelenen Satış (#198754)
- Satış Toplamı (#be123c)
- Tahsil Edilen (#0f766e)
- İptal Edilen (#f59e0b)

### Satış İşlemleri (3 büyük buton)
1. PERAKENDE SATIŞ GİR → perakende_satis_gir_penceresi (#198754)
2. YENİ MÜŞTERİYE SATIŞ → hizli_satis_penceresi("yeni") (#0f766e)
3. KAYITLI MÜŞTERİYE SATIŞ → hizli_satis_penceresi("kayitli") (#be123c)

### Filtreler
Belge Tipi: Tüm Belge Tipleri | Perakende Satış | Sipariş | Teklif
Dönem: Son 30 Gün | Son 3 Ay | Son 6 Ay | Son 1 Yıl | Tümü (default Son 1 Yıl)
Ara: Tümü | Müşteri İsmi / Belge No | Sipariş No | Ürün
Checkbox: İptalleri de göster

### Tablo
Tarih | İsim / Ünvan | Belge No | Sipariş No | Tutar | Durumu
Kanal filtresi: perakende, yeni müşteri, kayıtlı müşteri, magaza/mağaza

## Perakende Satış Gir
Yol: `Satışlar › Direkt Satışlar › Perakende Satış`
Sol: Tarih, Toplam, Tahsilat Türü (Nakit), Kasa/Hesap, Tahsilat, Toplam Tahsil, teslim checkbox, Açıklama
Sağ: ürün arama/barkod, liste, sepet tablosu (Ürün, Seçenek, Depo, Miktar, Birim Fiyat, KDV, İndirim, Toplam), Seçili Satırı Sil
Üst: Satış Kaydet (kırmızı), Geri Dön (turuncu)

## Perakende Satışlar (liste, ayrı menü yaprağı)
Kanal=perakende; kolonlar: Tarih, Sipariş No, Müşteri, Telefon, Teslim, Ürün Sayısı, Ürünler, Toplam, Kapora, Kalan, Durum, Cari Kart, Not
