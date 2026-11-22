# Goldfish re-review r2 — The Gilded Vault (best-heist-game-20261122-0559)

Reviewer independen (Goldfish), 22 Nov 2026 ~14:55 WIB. Read-only terhadap
kode: tidak ada file game/screenshot yang diubah. Dasar: top10-analysis.md,
build-log.md (revisi-1 + revisi-2), keempat screenshot baru di `screenshots/`
(dibaca sebagai gambar), dan verifikasi kode `game/src/render.js` +
`game/src/shots.js`. Deadline 23 Nov 00:59 WIB; field 3.280 submission;
leaderboard masih BLIND (tidak ada info peringkat baru sejak r1).

## Verdict: LAYAK SUBMIT

Alasan: tidak ada blocker teknis; kedua major yang *bisa* diperbaiki tanpa
rebalance (M1 lantai, M2 komposisi cover) sudah dikerjakan dan terbukti di
screenshot — bukan sekadar klaim build-log. Yang tersisa adalah M3 (depth
ceiling) dan m3 (teks HUD kecil), keduanya sengaja tidak dikerjakan dengan
alasan yang masuk akal (risiko rebalance; menjaga 3 screenshot lain tetap
valid). Menahan submit untuk satu putaran lagi hanya demi M3/m3 akan
menukar risiko rebalance dengan keuntungan yang tidak pasti, sementara
deadline tinggal ~10 jam. Submit sekarang.

## Skor per kriteria (/25)

| # | Kriteria | r1 | r2 | Catatan |
|---|----------|----|----|---------|
| 1 | Complete heist game in one frame | 5 | **5** | Tidak berubah. Cover menunjukkan thief, guard, kamera, loot, GETAWAY, alarm — semua dalam satu frame. |
| 2 | Fun and depth | 4 | **4** | Tidak berubah. M3 sengaja tidak dikerjakan; tools fixed, patrol garis lurus tetap. |
| 3 | Feel and polish | 4 | **4** | m1 tertutup (lihat bawah), legenda cone menambah kejelasan; tapi cover kini agak ramai di tengah (temuan N1) — menahan skor di 4. |
| 4 | Look and originality | 3 | **4** | NAIK. Lantai bukan lagi checkerboard generik polos: karpet diamond Corridor dan trim emas Vault terbaca jelas; marmer Gallery masih samar (lihat M1). |
| 5 | Structure | 5 | **5** | Tidak berubah. |
| | **Total** | **21** | **22/25** | |

## Status tiap item r1 (dengan bukti visual)

- **M1 lantai checkerboard generik — SEBAGIAN (kuat, belum penuh).**
  Kode terverifikasi: `paintFloorTile` di render.js memang menggambar motif
  per-room (Gallery vein diagonal, Corridor diamond emas, Vault grout emas +
  fleck). Visual: di 1-play.jpg (Corridor) diamond emas kecil berulang
  terbaca jelas di atas karpet marun — bukan lagi tile set generik; di
  4-win.jpg (Vault) grout emas + fleck emas terlihat. TAPI di 2-start.jpg
  dan 3-caught.jpg (Gallery) vein marmer hampir tak terlihat — kode memakai
  alpha 0,10 dan hanya 1 dari 4 tile, sehingga di still lantai Gallery
  masih terbaca sebagai grid gelap polos. Itu sebab kriteria 4 naik ke 4,
  bukan 5.
- **M2(a) cone guard vs kamera — SEBAGIAN.**
  Kode terverifikasi: guard = fill merah + edge SOLID + chevron segitiga di
  mulut cone; kamera = fill amber + edge DASHED `[7,5]`; chip legenda
  "— guard eyes / ┄ camera sweep" di kiri bawah layar play saja
  (render.js ~262–275, ~495–511, 546). Visual di 1-play.jpg: chevron merah
  kecil terlihat di dalam cone guard (kiri dan kanan), dan edge dashed
  amber terlihat pada cone kamera di tengah. TAPI: (i) hue amber vs merah
  berdekatan sehingga pada pandangan sekilas keduanya tetap "cone merah";
  (ii) tiga cone bertumpuk di tengah frame membuat area tengah menjadi
  gumpalan merah/oranye yang sulit diurai (temuan N1); (iii) chip legenda
  kecil dan kontras rendah, hampir tidak terbaca bila gambar dikecilkan.
  Terbedakan di ukuran penuh, belum tegas di thumbnail.
- **M2(b) staging cover — TERTUTUP.**
  Thief (lingkaran kuning/hitam) berada praktis di dead-center frame
  (~656,359 sesuai klaim build-log, terkonfirmasi visual) — bukan lagi di
  tepi kiri. Meter alarm di HUD terisi ~40% kuning dengan label
  "SUSPICIOUS" di bawahnya; build-log mencatat 40,6 — konsisten dengan
  bar yang terlihat dan berada dalam target 35–50. Guard mendekat di
  belakang thief, menambah ketegangan. Ini perbaikan komposisi yang nyata.
- **M3 depth ceiling — TERBUKA (sengaja, sesuai keputusan r1).**
  Tools fixed, patrol garis lurus. Tidak dikerjakan dan tidak diminta
  dikerjakan; dicatat agar tidak dianggap terlewat.
- **m1 label "OPEN" bocor menembus overlay win — TERTUTUP.**
  Kode terverifikasi: label pintu/exit hanya dilukis saat
  `screen === SCREEN_PLAY` (render.js ~471, 535). Visual di 4-win.jpg:
  "THE IDOL IS YOURS" bersih — tidak ada "OPENOPEN" atau teks hantu
  apa pun menembus overlay. Terverifikasi, bukan klaim.
- **m2 alarm cover 0 — TERTUTUP.**
  Ikut tertutup oleh M2(b): alarm cover kini ~40 "SUSPICIOUS", bukan 0/"quiet".
- **m3 teks HUD kecil — TERBUKA (sengaja).**
  Tidak dikerjakan agar 2-start/3-caught/4-win tidak basi. Tetap minor:
  baris kontrol kanan atas dan label HUD masih kecil di 1280×720, tapi
  semua teks masih terbaca di ukuran penuh.

## Estimasi rank baru (jujur, tidak digelembungkan)

- **Rank: 20–45 dari 3.280, sentral ~28–30** (r1: 25–50, sentral ~30–40).
- **Peluang top 40: 55–70%** (r1: 45–60%).
- **Peluang top 10 (hadiah): 15–25%** (r1: 10–15%).
- **Peluang top 50: 70–85%** (r1: 60–75%; batas bawah 70% ≥ syarat 30%).

Catatan kejujuran: revisi-2 mengangkat estimasi, tapi tidak sejauh target
penuh "rank 15–30, top 10 ~20–30%". Alasannya: perbaikannya visual-only
dan tidak merata — M1 penuh hanya di Corridor/Vault, M2(a) hanya tegas di
ukuran penuh — sementara M3 (depth, penentu kriteria 2 di final heat)
tetap terbuka. Sentral ~28–30 masih di dalam rentang target 15–30, tapi
di ujung atasnya; peluang top 10 15–25% menyentuh batas bawah target
20–30%, bukan melampauinya. Revisi ini GUNA (rank membaik, bukan stagnan),
tapi bukan lompatan besar. Tidak ada data leaderboard baru (masih blind),
jadi estimasi ini tetap berbasis kriteria juri + baseline starter, sama
seperti r1.

## Temuan baru (belum disebut r1)

- **N1 — Tumpukan cone di tengah cover.** Pose thief di tengah jalur
  patrol menempatkannya di titik tumpang-tindih 3 cone sekaligus. Hasilnya
  area tengah 1-play.jpg adalah gumpalan merah/oranye yang ramai; mata
  sulit mengurai cone mana milik siapa. Ironis: pose yang menciptakan
  alarm 40 juga menciptakan kekacauan visual ini.
- **N2 — Thief kecil dan kurang kontras.** Thief hanya ~20 px, kuning/
  hitam, berdiri di dalam cone merah — di ukuran penuh oke, tapi di
  contact sheet/thumbnail ia mudah hilang. Hero-nya sudah di tengah,
  tapi belum "menonjol".
- **N3 — Vein marmer Gallery terlalu samar.** Alpha 0,10 di kode =
  nyaris tak terlihat di still (2-start, 3-caught). Ini satu-satunya
  alasan M1 tidak tertutup penuh.
- **N4 — Chip legenda hampir tidak terbaca saat dikecilkan.**
  Berguna di ukuran penuh, tapi bukan penyelamat diferensiasi cone di
  thumbnail — di sanalah juri pertama kali melihat cover.
- **N5 (minor) — Label "GETAWAY" di tepi kanan cover sangat samar;**
  yang terbaca jelas hanya lingkaran hijau "2/4". Meter alarm juga hanya
  berupa bar tanpa angka — label "SUSPICIOUS" menebusnya sebagian.

## Rekomendasi: SUBMIT SEKARANG

Tidak ada satu putaran lagi yang wajib sebelum submit. Bila masih ada waktu
luang sebelum deadline 00:59 WIB dan parent menginginkan satu micro-round
opsional (bukan syarat submit), satu-satunya yang paling berdampak adalah
**N1+N2: pose ulang cover** — geser thief ke tepi SATU cone guard (bukan
titik tumpang-tindih tiga cone) sambil menjaga alarm 35–50, plus outline
lebih tebal pada thief. Itu hanya menyentuh staging shot, tanpa rebalance.
Risikonya: re-shoot cover bisa kehilangan staging alarm-40 yang sudah
bagus, jadi jangan kerjakan tanpa verifikasi visual ulang. M3 dan m3 tetap
tidak disarankan dikerjakan.

## Ringkas

Verdict LAYAK SUBMIT · skor 22/25 (5/4/4/4/5) · rank 20–45, sentral ~28–30 ·
top 40 55–70%, top 10 15–25%, top 50 70–85% · M1 SEBAGIAN, M2(b)/m1/m2
TERTUTUP, M2(a) SEBAGIAN, M3/m3 TERBUKA (sengaja).
