# ⟡ Pedang Bayangan

Kawanan partikel berbentuk pedang kecil yang bereaksi terhadap gestur tanganmu lewat webcam — terinspirasi dari efek "sword swarm" di video referensi, tapi hanya memakai gestur tangan (kerangka tangan neon), **tanpa pernah menampilkan wajah atau video kamera mentah di layar**.

100% HTML/CSS/JS polos. Tidak ada proses build, tidak ada server backend — semua pelacakan tangan berjalan di browser (on-device, via MediaPipe Hands) dan efek visual digambar dengan Three.js.

## Cara pakai

1. Buka `index.html` langsung di browser modern (Chrome/Edge/Safari terbaru), **atau** deploy ke GitHub Pages (lihat di bawah).
2. Tekan **"Mulai kamera"** dan izinkan akses webcam.
3. Angkat satu tangan di depan kamera dan coba gestur berikut:

| Gestur | Efek |
|---|---|
| 🖐️ Telapak terbuka | Ledakan cincin cahaya berulang |
| ✊ Kepalan tangan | Pusaran portal berputar |
| 🤘 Tanda rock (telunjuk + kelingking) | Bola pedang anyaman |
| ✌️ Tanda V / peace | Hujan pedang bercahaya + halo portal |
| ☝️ Gestur lain / tangan santai | Kawanan pedang mengalir mengikuti tangan |

4. Ganti tema warna bilah lewat 4 swatch di pojok kanan bawah (Aether, Ember, Verdant, Frost) — seluruh kawanan & kerangka tangan ikut berubah warna secara halus.

## Deploy ke GitHub Pages

```bash
git init
git add .
git commit -m "Pedang Bayangan"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

Lalu di repo GitHub: **Settings → Pages → Branch: main → Save**. Situs akan aktif di `https://<username>.github.io/<repo>/` dalam beberapa menit.

> Webcam hanya bisa diakses lewat **HTTPS** (atau `localhost`) — GitHub Pages sudah otomatis HTTPS, jadi aman dipakai langsung.

## Privasi

- Elemen `<video>` yang menampung gambar kamera **sengaja disembunyikan** (`opacity:0`, `1px × 1px`) dan tidak pernah digambar ke kanvas — hanya 21 titik koordinat tangan (dari MediaPipe Hands) yang dipakai untuk menggerakkan partikel dan kerangka neon.
- Semua pemrosesan terjadi di browser pengguna. Tidak ada gambar, video, atau data tangan yang dikirim ke server mana pun.
- Saat tombol "Hentikan kamera" ditekan, semua *track* MediaStream langsung dihentikan (`track.stop()`).

## Struktur file

```
index.html   → struktur halaman, elemen video tersembunyi, kanvas, panel HUD
style.css    → tema visual "arcane-tech HUD" (token warna, panel kaca bersudut)
app.js       → Three.js (partikel pedang + kerangka tangan + jejak cahaya)
             → MediaPipe Hands (deteksi 21 titik tangan + klasifikasi gestur)
README.md    → dokumen ini
```

## Kustomisasi cepat

Semua ada di `app.js`, bagian atas & tengah file:

- `PARTICLE_COUNT` — jumlah pedang dalam kawanan (otomatis lebih sedikit di layar sempit demi performa).
- `THEMES` — array 4 tema warna; tambahkan objek baru `{ id, name, a, b }` untuk tema tambahan.
- `computeTarget()` — rumus posisi tiap formasi (`OPEN`, `FIST`, `ROCK`, `PEACE`, `FLOW`). Ubah angka radius/kecepatan di sini untuk menyesuaikan bentuk kawanan.
- `createSwordTexture()` — bentuk siluet pedang (bilah + pengaman silang + gagang) digambar lewat `<canvas>` 2D saat halaman dimuat.

## Dependensi (via CDN, tanpa `npm install`)

- [Three.js](https://threejs.org/) `0.160.0`
- [MediaPipe Hands](https://developers.google.com/mediapipe) (model pelacakan tangan Google)
- Google Fonts: Cinzel & Space Grotesk
