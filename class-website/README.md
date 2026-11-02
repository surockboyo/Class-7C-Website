# Ruang Kelas — SMPN 62 Surabaya

Website kelas satu halaman yang bisa dipasang di ponsel. Isinya papan informasi, tugas, jadwal, momen kelas, roda nama, laporan WhatsApp, saran, dan panel pengelola.

> **Status integrasi:** website tetap satu halaman di GitHub Pages. Koleksi kelas, pengaturan situs, galeri, laporan, saran, dan aktivitas memakai Supabase sesuai RLS. Owner masuk melalui Supabase Auth; pastikan schema terbaru sudah dijalankan sebelum menguji login, Storage, dan Realtime.

> **Privasi dan keamanan:** repositori publik memperlihatkan semua berkas dan riwayat commit. Project URL dan anon/publishable key memang publik; jangan pernah menaruh service-role key, password database, password Owner, atau data pribadi di sini. RLS adalah perlindungan server. Login Owner nyata ditangani Supabase Auth.

## Fitur

- Informasi kelas, PR, ulangan, kisi-kisi, pengumuman, jadwal, siswa, pengaturan situs, dan riwayat roda dibagikan lewat Supabase.
- Jadwal pelajaran WIB yang berganti sesuai hari dan jam.
- Momen kelas berbentuk piringan yang bisa digeser atau mode daftar; gambar galeri disimpan di Supabase Storage.
- Roda nama untuk pemilihan acak.
- Laporan dan saran masuk ke kotak masuk Owner; WhatsApp tetap membuka draf yang perlu dikirim manual.
- Ekspor/impor cadangan, tema whiteboard/chalkboard dengan pilihan aksen, dan dukungan instalasi/offline dasar.
- Label sumber data membantu membedakan `Published`, `Local changes`, dan `Imported backup`.

## Tumpukan teknologi

HTML, CSS, dan JavaScript ES modules tanpa framework atau proses build. GitHub Pages meng-host halaman statis; Supabase menyediakan database/auth/storage terkelola. Klien Supabase dipin dan disimpan lokal di `assets/vendor/`, bukan dimuat dari CDN.

## Menjalankan di komputer

Pasang Python 3, buka PowerShell pada folder proyek, lalu jalankan:

```powershell
python -m http.server 8080
```

Buka `http://localhost:8080`. Jangan membuka `index.html` langsung sebagai `file://`: browser dapat membatasi modul, penyimpanan, dan service worker. Tes logika bawaan dapat dijalankan dengan Node.js:

```powershell
node --test
```

## Login Owner

1. Buat akun Owner melalui Supabase **Authentication → Users**.
2. Tambahkan UUID pengguna itu ke `public.owners` sesuai petunjuk di [supabase/README_SETUP.md](./supabase/README_SETUP.md).
3. Matikan pendaftaran publik setelah akun Owner siap.
4. Ketuk logo Ruang Kelas lima kali dalam tiga detik untuk membuka dialog masuk. `Username` adalah email akun; gunakan `Password` akun Supabase.

Kontrol pengelolaan hanya tampil setelah sesi Supabase valid dan akun cocok dengan `owners`. Kebijakan RLS tetap menjadi perlindungan server. Jangan bagikan Password Owner.

## Penyimpanan lokal dan keterbatasannya

Tema/aksen, checklist, like, pengaturan suara/getar, jeda cooldown, dan mode tampilan galeri tetap per browser. Data kelas memakai Supabase dengan cache lokal untuk pembukaan cepat dan baca offline. Galeri publik ada di Supabase Storage; laporan/saran dan aktivitas ada di tabel Supabase yang dibatasi RLS.

Penyimpanan tersebut:

- Preferensi lokal tidak dibagikan dengan browser, perangkat, guru, atau Owner lain.
- Bisa dihapus oleh pengguna, mode privat, kebijakan browser, atau ruang perangkat yang penuh.
- Bukan pengganti cadangan. Ekspor secara berkala dan simpan berkas cadangan di tempat yang aman.
- Cache hanya untuk membaca; saat offline, perubahan Dashboard ditolak dan tidak dimasukkan ke antrean.
- Paket gratis Supabase dapat memiliki batas penggunaan, kuota, atau jeda proyek yang tidak aktif. Periksa batas dan kebijakan terbaru di Dashboard Supabase; jangan menganggap layanan gratis selalu aktif atau tanpa batas.

Saat offline, halaman dapat menampilkan cache terakhir. Perubahan Dashboard ditolak dan tidak dimasukkan ke antrean. Lampiran laporan bersifat privat dan hanya Owner yang bisa membacanya.

## Ekspor, impor, dan pemulihan

Di `Dashboard` → `Backup dan Restore`:

1. Pilih `Unduh cadangan JSON` untuk mengekspor koleksi yang tersedia di cache perangkat serta gambar lokal yang tersimpan.
2. Saat impor, aplikasi memeriksa struktur seluruh berkas dan menampilkan ringkasan sebelum meminta konfirmasi.
3. Berkas tidak valid tidak diterapkan. Simpan cadangan sebelum impor, terutama ketika ada banyak gambar.
4. Reset memerlukan konfirmasi dan izin Owner untuk data bersama. Jangan anggap ekspor JSON saat ini mencakup berkas gambar di Supabase Storage atau memulihkan inbox reports/suggestions; simpan cadangan database/storage sebelum perubahan besar.

Jangan hapus data browser sebelum memastikan cadangan dapat dibuka.

## Memperbarui informasi yang dilihat semua pengunjung

Perubahan Dashboard yang dikonfirmasi server akan dibaca perangkat lain. `data/default-data.json` hanya seed/fallback awal dan bukan sumber perubahan rutin.

Data browser lama tidak dipindahkan otomatis. Migrasi memerlukan cadangan terverifikasi dan konfirmasi Owner.

## Mengunggah ke GitHub

Sebelum membuat repositori publik, tinjau seluruh berkas dan riwayat commit. Repositori publik memperlihatkan semua berkas, kode, data, dan nilai konfigurasi yang ada di dalamnya. Jangan commit kode Dashboard plaintext, data pribadi, laporan, saran, atau cadangan lokal.

1. Buat **repositori kosong** di GitHub. Jangan centang opsi untuk menambahkan README, `.gitignore`, atau license; berkas-berkas proyek ini sudah ada.
2. Buka PowerShell di folder proyek. Pastikan ini memang repositori Git yang sudah ada:

   ```powershell
   git rev-parse --is-inside-work-tree
   git status --short --branch
   ```

   Perintah pertama menampilkan `true` jika folder ini sudah merupakan repositori; tidak perlu menjalankan `git init` lagi.
3. Ganti branch lokal menjadi `main`, lalu periksa apakah remote sudah terpasang:

   ```powershell
   git branch -M main
   git remote -v
   ```

4. Jika belum ada remote bernama `origin`, tambahkan URL repositori yang baru dibuat (ganti alamat contoh dengan URL milikmu), lalu unggah branch:

   ```powershell
   git remote add origin https://github.com/USERNAME/REPO-NAME.git
   git push -u origin main
   ```

   Jika `origin` sudah tercantum, jangan tambahkan duplikat; pastikan URL-nya benar sebelum push.

## Mengaktifkan GitHub Pages

Di repositori GitHub, buka **Settings → Pages → Build and deployment**. Pada **Source**, pilih **Deploy from a branch**, lalu pilih branch **main** dan folder **/ (root)**, kemudian tekan **Save**.

Setelah publikasi selesai, pola URL situsnya:

```text
https://<username>.github.io/<repo-name>/
```

Tunggu deployment GitHub Pages dan service worker selesai memasang shell. Jalur aset proyek relatif agar mendukung subpath repositori.

## Data publik dan perubahan

Preferensi yang memang lokal tetap di perangkat masing-masing; konten kelas, metadata dan gambar galeri, laporan, serta saran menggunakan Supabase sesuai kebijakan akses. Tidak ada data browser lama yang dimigrasikan otomatis.

Semua isi repositori publik dan riwayat commit dapat dilihat siapa pun. Kunci anon/publishable memang publik; kebijakan RLS Supabase adalah perlindungan server dan harus diuji. Dashboard menggunakan autentikasi Supabase; anon key bukan rahasia. Hindari mengunggah informasi pribadi yang tidak diperlukan.

## Lisensi

Owner memilih untuk tidak menyertakan lisensi open-source (all rights reserved). Tidak adanya berkas `LICENSE` berarti repositori publik ini tidak memberikan izin penggunaan ulang.

## Cara menjalankan tes

Pasang Node.js, buka PowerShell di folder proyek, lalu jalankan:

```powershell
node --test
```

## Instalasi PWA

- **Android:** buka situs di browser yang mendukung PWA lalu gunakan menu `Install app` atau `Tambahkan ke layar utama`.
- **iPhone/iPad:** buka melalui Safari, pilih tombol Bagikan, lalu `Add to Home Screen`. Alur pemasangan berbeda dari Android.
- Instalasi dan service worker memerlukan HTTPS (localhost diperbolehkan untuk pengembangan).
- Saat offline, shell situs dan aset yang telah disimpan dapat terbuka. Publikasi terbaru, gambar yang belum tersimpan, dan layanan WhatsApp tetap memerlukan jaringan sesuai fiturnya. Data pengguna tidak masuk cache service worker.

## WhatsApp, laporan, dan saran

Nomor tujuan disetel Owner di `Dashboard` → `Pengaturan`; kosongkan untuk menonaktifkan tautan. Nomor harus 10–15 digit internasional tanpa `+` atau spasi.

Laporan dan saran yang terkirim disimpan online di kotak masuk Owner; ini tidak membuktikan Guru sudah membacanya. Tombol WhatsApp hanya membuka teks draf; pengirim tetap harus menekan Kirim. Lampiran laporan dikirim ke bucket privat, sedangkan pengiriman WhatsApp tetap perlu melampirkannya manual.

## Privasi, keamanan, dan penyimpanan

- Supabase menjadi backend bersama untuk data dan media; GitHub Pages hanya meng-host aplikasi statis.
- Login Owner memakai Supabase Auth dan membership `owners`; RLS server adalah perlindungan data yang sebenarnya.
- Anon/publishable key dirancang untuk terlihat di browser. Jangan pernah mengekspos service-role key atau kredensial Owner.
- Jangan memasukkan nomor telepon asli atau informasi siswa ke berkas contoh publik.
- Izin browser, mode privat, kuota, dan pembersihan penyimpanan dapat membatasi atau menghapus data lokal.
- Gambar yang diunggah diperiksa tipe/isi dan dikompres di browser. Jangan mengunggah foto tanpa izin yang sesuai.

## Pemecahan masalah

- **Halaman kosong:** jalankan lewat server lokal/HTTPS, bukan `file://`; cek Console dan Network browser.
- **Dashboard tidak bisa dibuka:** pastikan akun berhasil dibuat di Supabase Auth, UUID-nya ada di `public.owners`, dan URL/key publik pada `assets/js/config.js` benar. Jangan membagikan Password Owner.
- **Nomor WhatsApp tidak aktif:** masukkan nomor digit internasional melalui Dashboard.
- **Impor gagal:** ekspor cadangan lama, periksa JSON, schema, dan gambar yang dirujuk; data sebelumnya seharusnya tetap dipakai.
- **Perubahan tidak terlihat teman:** pastikan penulisan berhasil di server, jaringan aktif, tabel memiliki policy RLS yang sesuai, dan tunggu pembaruan langsung atau muat ulang.
- **Situs belum berubah setelah deploy:** terima prompt pembaruan jika muncul, muat ulang, atau bersihkan data situs hanya setelah mencadangkan data lokal.
- **Foto hilang:** pastikan metadata merujuk ke objek yang ada di bucket `gallery`; kegagalan gambar menampilkan placeholder. Jangan menghapus objek Storage tanpa konfirmasi Owner.

## QA

Status pengujian aktual dicatat di `HANDOFF.md`. Jangan menganggap fitur sudah diuji hanya karena tombol atau tampilannya tersedia.
