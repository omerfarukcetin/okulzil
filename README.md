# Okul Zil ve Pano

Zil sistemi, koridor TV panosu, İstiklal Marşı / saygı duruşu törenleri ve acil durum alarmları tek programda.
İnternet gerekmez; okulun yerel ağında çalışır.

## Nasıl çalışır?

- **Sistem odasındaki bilgisayar:** Program açılınca TV'lere giden ekranda tam ekran pano gösterilir. Zil, tören ve alarm sesleri bu bilgisayardan çıkar.
- **Telefon / öğretmenler odası bilgisayarı:** Aynı ağdan `http://<sistem-odası-ip>:3000/panel/` adresi açılır, PIN ile girilir. Varsayılan PIN: **1234** (ilk iş değiştirin).
- **Sistem odasında acil kullanım:** `Ctrl+Shift+P` küçük paneli açar (3 dk işlem yapılmazsa kapanır). Ekran TV'lere yansıdığı için kısa tutun.
- **Programı kapatmak:** `Ctrl+Shift+Alt+Q`.

## Kurulum (Windows, önerilen)

1. GitHub'da **Releases** sayfasından en son `OkulZil-Kurulum-x.y.z.exe` dosyasını indirin.
2. Çalıştırın. Windows "Bilinmeyen yayımcı" uyarısı verirse **Ek bilgi → Yine de çalıştır** deyin.
3. Kurulum bitince program açılır, pano TV'lere tam ekran gelir ve Windows her açıldığında kendiliğinden başlar.
4. Telefondan paneli açın (adres: Ayarlar › Sistem). İlk girişte kurulum sihirbazı açılır.

Ayarlar `%APPDATA%\Okul Zil ve Pano\` klasöründe saklanır. Güncelleme için yeni kurulum dosyasını aynı şekilde çalıştırmanız yeterli; ayarlar korunur.

**Yeni kurulum dosyası üretmek (geliştirici):** sürüm numarasını `package.json`'da artırıp `git tag v0.2.1 && git push --tags` yapın. GitHub Actions `.exe` dosyasını derleyip Releases'a ekler. Actions sekmesinden "Run workflow" ile de derlenebilir.

## Kurulum (geliştirme)

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

### Güncelleme

```
git pull
```
sonra sunucuyu yeniden başlatın (`Ctrl+C`, `npm run server` ya da `npm start`). Açık olan TV panosu ve paneller yeni sürümü kendiliğinden algılayıp yenilenir (tören ya da alarm sürüyorsa bittikten sonra). Çalışan sürüm panelde **Ayarlar → Bağlantı** bölümünde yazar.

## Kontrol paneli

Telefon ve bilgisayarda aynı panel açılır (geniş ekranda yan menü, telefonda alt menü). Açık / koyu tema sağ üstteki düğmeyle değişir.

- **Ana sayfa:** şu anki durum (ders / teneffüs ve kalan süre), sıradaki ziller, zil çal, zil atla, sesli anons, tören başlat, acil durum alarmları.
- **Zil:** bugünkü program, programları düzenleme, **Hızlı oluştur** (ilk ders, ders süresi, teneffüs ve öğle arasından saatleri hesaplar), yeni program, teneffüs müziği, günün akışı.
- **Törenler:** her tören tek kartta; "Ekranı aç / Başlat". Düzenle penceresinde zamanlama, sesin ne zaman başlayacağı, adımlar ve saygı duruşu ekranı.
- **Duyurular:** duyurular, kayan yazı, nöbetçiler, menü (satır satır), medya yükleme.
- **Ayarlar:** Genel (okul adı, toplanma alanı, PIN), Görünüm (canlı TV önizlemesiyle logo, tema, düzen, teneffüs görünümü, İstiklal Marşı ekranı — ay yıldız / görsel / bayrak videosu), Sesler, Takvim (ders günleri, tatiller, uzun tatiller), Sistem (adresler, TV'de ses testi, kurulum sihirbazı, kayıt).

İlk açılışta **kurulum sihirbazı** okul adı, logo, ders saatleri, sesler, tema ve PIN'i adım adım sorar. Sonradan Ayarlar › Sistem'den yeniden açılabilir.

## Ses dosyaları

Sesler panelden yüklenir: **Ayarlar › Sesler**. Her iş (giriş zili, öğretmen zili, çıkış zili, İstiklal Marşı, siren, anons sesi, alarmlar) için yüklenen seslerden biri seçilir; "Dinle" sesi telefonda çalar. Teneffüs müzikleri de aynı sayfadan yüklenir.

Elle eklemek isterseniz dosyaları ayar klasöründeki `sounds/` klasörüne de koyabilirsiniz. Varsayılan dosya adları:

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

## Otomatik program seçimi

**Zil** sayfasında: haftanın her günü için ayrı program (örn. Cuma → Cuma programı) ve tarih aralıkları (örn. 12–16 Ocak → Sınav günü). Öncelik: bugüne elle seçim › tarih aralığı › haftanın günü › varsayılan program.

## Hava durumu ve geri sayım

- **Hava durumu:** Ayarlar › Genel'den şehir aranıp seçilir; TV'nin sağ üstünde sıcaklık ve gün içi en yüksek/en düşük görünür. Open-Meteo kullanılır (ücretsiz, anahtar gerekmez). Okul bilgisayarında internet yoksa görünmez, zil etkilenmez.
- **Geri sayım:** Duyurular sayfasından eklenir (örn. "LGS · 187 gün"). En yakın ikisi TV'de görünür; tarihi geçenler kendiliğinden kalkar.

## Yedekleme

Ayarlar › Sistem › **Yedeği indir**: ayarlar, sesler, logo ve medya tek ZIP dosyası. Yeni bilgisayarda **Yedekten geri yükle** ile her şey geri gelir (PIN değişmez, önceki ayarlar ayrıca saklanır).

## Öncelik sırası

Acil durum alarmı > Tören > Zil. Alarm çalarken zil ve tören çalmaz; tören sürerken zil atlanır.
Her şey `kayit.log` dosyasına yazılır.

## Ayar dosyası

Tüm ayarlar `config.json` içinde (kurulumda `%APPDATA%\Okul Zil ve Pano\`). Yedeklemek için bu dosyayı kopyalamanız yeterli.
