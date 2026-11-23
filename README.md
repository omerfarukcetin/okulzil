# Okul Zil ve Pano

Zil sistemi, koridor TV panosu, İstiklal Marşı / saygı duruşu törenleri ve acil durum alarmları tek programda.
İnternet gerekmez; okulun yerel ağında çalışır.

## Nasıl çalışır?

- **Sistem odasındaki bilgisayar:** Program açılınca TV'lere giden ekranda tam ekran pano gösterilir. Zil, tören ve alarm sesleri bu bilgisayardan çıkar.
- **Telefon / öğretmenler odası bilgisayarı:** Aynı ağdan `http://<sistem-odası-ip>:3000/panel/` adresi açılır, PIN ile girilir. Varsayılan PIN: **1234** (ilk iş değiştirin).
- **Sistem odasında acil kullanım:** `Ctrl+Shift+P` küçük paneli açar (3 dk işlem yapılmazsa kapanır). Ekran TV'lere yansıdığı için kısa tutun.
- **Programı kapatmak:** `Ctrl+Shift+Alt+Q`.

## Kurulum (Windows, geliştirme)

1. [Node.js LTS](https://nodejs.org) kurun.
2. Bu klasörde komut satırı açın:
   ```
   npm install
   npm start
   ```
3. Kurulum dosyası (.exe) üretmek için: `npm run dist` → `dist/` klasörü.

Sadece tarayıcıda denemek için (Electron olmadan): `npm run server`, sonra
- Pano: http://localhost:3000/pano/ (sesi açmak için ekrana bir kez tıklayın; ek ekranlarda sessiz istenirse sonuna ?audio=0 ekleyin)
- Panel: http://localhost:3000/panel/

Testler: `npm test`

## Ses dosyaları

`sounds/` klasörüne (ya da paneldeki **Ayarlar → Bağlantı** bölümünde yazan ses klasörüne) şu adlarla koyun:

| Dosya | Ne için |
|---|---|
| `zil-ogrenci.mp3` | Derse giriş zili |
| `zil-ogretmen.mp3` | Öğretmen zili |
| `zil-cikis.mp3` | Çıkış zili |
| `istiklal-marsi.mp3` | İstiklal Marşı (MEB'in resmî kaydı önerilir) |
| `siren.mp3` | Saygı duruşu sireni |
| `anons.mp3` | Anons öncesi "ding-dong" |
| `deprem.mp3`, `yangin.mp3`, `tahliye.mp3`, `sinifta-kal.mp3` | Acil durum sesleri |
| `muzik/*.mp3` | Teneffüs müzikleri (rastgele çalar) |

Dosya yoksa program yedek olarak kendi ürettiği zil ve siren seslerini çalar; yine de gerçek dosyaları koymanız önerilir.
İstiklal Marşı dosyası yoksa tören ekranı gösterilir ama marş çalmaz.

Sesli anons Windows'un metin okuma sesini kullanır. Türkçe ses yoksa:
**Ayarlar → Saat ve dil → Konuşma → Ses ekle → Türkçe.**

## Okul bilgisayarı için ayarlar

- Windows bildirimlerini ve **Odaklanma Yardımı**'nı kapatın (TV'lere bildirim yansımasın).
- Windows Update'te **etkin saatleri** 07:00–18:00 yapın, otomatik yeniden başlatmayı kapatın.
- Güç ayarlarında uyku ve ekran kapanmasını **Hiçbir zaman** yapın (program ayrıca uykuyu engeller).
- Saatin doğru olması için **Saati otomatik ayarla** açık kalsın.
- Bilgisayara sabit IP verin; telefon paneli adresi değişmesin.
- Windows Güvenlik Duvarı ilk açılışta soracak: **Özel ağlarda izin ver**.

## Törenler: ekran ve ses ayrı

Her tören iki adımlıdır:
1. **Ekran açılır** (panelden "Ekranı aç" ya da otomatik saatinde). TV'lerde bayrak / saygı duruşu ekranı görünür, ses çalmaz.
2. **Öğretmen işaret verince ses başlar:** panelde "▶ Başlat" ya da sistem odasındaki bilgisayarda **Enter / Boşluk**.

Tören ayarlarında "Ses ne zaman başlasın" seçeneği:
- **Öğretmen komutuyla** (varsayılan)
- **Kendiliğinden**: otomatik açılışta ekran açıldıktan belirli dakika sonra çalar. Örn. 10 Kasım: ekran 09:00'da açılır, siren 09:05'te kendiliğinden başlar (yine de istenirse daha önce "Başlat"a basılabilir).

Birden fazla adımlı törenlerde (örn. saygı duruşu → İstiklal Marşı) her adım için "öncesinde komut bekle" seçilebilir.
Ekran açık kalıp 3 saat içinde komut gelmezse kendiliğinden kapanır.

### Tören ekranlarını özelleştirme

Panelde **Törenler** sekmesinde:
- **İstiklal Marşı ekranı:** üst yazı, başlık, arka plan rengi, tören adı, ay yıldız ya da yüklenen bir görsel (bayrak fotoğrafı, amblem), ilerleme çubuğu.
- **Saygı duruşu ekranı** (her tören için ayrı, "Düzenle" içinde): başlık, üst yazı (boşsa tarih/saat), mesaj, görsel (örn. Atatürk fotoğrafı), siyah-beyaz görünüm, adımların gösterilmesi, arka plan rengi.

Önizleme için töreni **Ekranı aç** ile açın; ses komut gelene kadar çalmaz.

## TV görünümü ve medya

Panelde **Ekran** sekmesinden:
- **Okul logosu:** PNG (şeffaf arka planlı önerilir), SVG, JPG, WEBP. Normal / Büyük boyut; koyu temada görünmeyen logolar için beyaz zemin seçeneği. Logo TV'de ve panelin üstünde görünür.
- **Tema:** Gece, Gündüz, Okyanus, Orman, Bayrak, Kum, Yüksek kontrast. Vurgu rengi hazır renklerden ya da özel renk ile değiştirilebilir.
- **Düzen:** Klasik (saat, zil, duyurular), Medya + bilgi (büyük video/afiş alanı + saat, zil, duyurular), Tam ekran medya (alt şeritte saat, duyuru, zil).
- **Teneffüs görünümü:** teneffüs (yeşil), öğle arası (turuncu) ve ders başlamadan önceki uyarı (sarı, yanıp söner) için ekran rengi değişir; teneffüste en büyük yazı "derse kalan süre" olur. Yazılar ("TENEFFÜS", "SINIFLARINIZA GEÇİN"...), renkler ve uyarının kaç dakika önce çıkacağı panelden değiştirilir.
- **Medya:** JPG, PNG, WEBP, GIF, MP4, WEBM yüklenir (dosya başına en fazla 2 GB). Sıra, resim süresi, video sesi ve yayında olup olmadığı ayarlanır.
- "Medyayı sadece teneffüs ve ders dışında göster" seçilirse ders sırasında Klasik düzene geçer.

Videolar **her zaman sessiz** oynar; bilgisayar zil sistemine bağlı olduğu için video sesi açılamaz.
Medya dosyaları ayar klasöründeki `media/` klasöründe saklanır.

Panelin kendi teması sağ üstteki düğmeyle değişir: Otomatik (cihaza göre) → Açık → Koyu.

## Öncelik sırası

Acil durum alarmı > Tören > Zil. Alarm çalarken zil ve tören çalmaz; tören sürerken zil atlanır.
Her şey `kayit.log` dosyasına yazılır.

## Ayar dosyası

Tüm ayarlar `config.json` içinde (Electron'da `%APPDATA%/okul-zil/`). Yedeklemek için bu dosyayı kopyalamanız yeterli.
