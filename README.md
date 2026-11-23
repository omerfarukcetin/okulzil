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
| `ataturk.jpg` | Saygı duruşu ekranındaki görsel |

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

## TV görünümü ve medya

Panelde **Ekran** sekmesinden:
- **Tema:** Koyu ya da Açık. Vurgu rengi hazır renklerden ya da özel renk ile seçilir.
- **Düzen:** Klasik (saat, zil, duyurular), Medya + bilgi (büyük video/afiş alanı + saat, zil, duyurular), Tam ekran medya (alt şeritte saat, duyuru, zil).
- **Medya:** JPG, PNG, WEBP, GIF, MP4, WEBM yüklenir (dosya başına en fazla 2 GB). Sıra, resim süresi, video sesi ve yayında olup olmadığı ayarlanır.
- "Medyayı sadece teneffüs ve ders dışında göster" seçilirse ders sırasında Klasik düzene geçer.

Videolar varsayılan olarak sessizdir (ses zil hoparlörlerinden çıkacağı için). Sesli işaretlenen video zil ve anons sırasında kısa süre susturulur.
Medya dosyaları ayar klasöründeki `media/` klasöründe saklanır.

Panelin kendi teması sağ üstteki düğmeyle değişir: Otomatik (cihaza göre) → Açık → Koyu.

## Öncelik sırası

Acil durum alarmı > Tören > Zil. Alarm çalarken zil ve tören çalmaz; tören sürerken zil atlanır.
Her şey `kayit.log` dosyasına yazılır.

## Ayar dosyası

Tüm ayarlar `config.json` içinde (Electron'da `%APPDATA%/okul-zil/`). Yedeklemek için bu dosyayı kopyalamanız yeterli.
