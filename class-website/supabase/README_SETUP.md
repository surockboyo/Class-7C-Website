# Menyiapkan Supabase

Panduan ini membuat backend bersama untuk website kelas. Website tetap satu halaman di `index.html`, memakai vanilla HTML/CSS/JavaScript dan di-host melalui GitHub Pages; Supabase menyediakan database Postgres, Auth, Storage, dan Realtime.

> **Keamanan:** jangan pernah menaruh `service_role` key, password database, atau password Owner di kode, dokumentasi, screenshot, tes, chat, maupun Git. Hanya Project URL dan anon/publishable key yang boleh dimasukkan ke konfigurasi publik `assets/js/config.js`. Anon key memang publik; keamanan data harus ditegakkan oleh RLS.

## 1. Buat proyek

1. Buka [supabase.com](https://supabase.com/) dan masuk atau buat akun.
2. Dari dashboard, pilih **New project**.
3. Pilih organisasi, masukkan nama proyek, pilih wilayah yang sesuai, dan buat password database yang kuat. Simpan password database di password manager pribadi, bukan di repositori.
4. Pilih paket yang tersedia dan tekan **Create new project**. Tunggu provisioning selesai.

## 2. Jalankan schema

1. Di dashboard proyek, buka **SQL Editor**.
2. Pilih **New query**.
3. Buka `supabase/schema.sql` di komputer, salin seluruh isinya, dan tempel ke SQL Editor.
4. Tekan **Run**. Pastikan query selesai tanpa error.
5. Untuk memeriksa tabel, buka **Table Editor**. Seharusnya tersedia `owners`, `records`, `reports`, `suggestions`, dan `activity_log`. Bucket Storage dibuat oleh SQL.

Jalankan schema saat menyiapkan proyek baru. Script boleh dijalankan kembali untuk menerapkan policy dan publikasi Realtime yang dikelolanya, tetapi bukan alat migrasi isi data. Periksa hasil query dan jangan menghapus tabel atau bucket yang sudah berisi data.

## 3. Buat akun Owner dan daftarkan UUID

1. Buka **Authentication → Users**.
2. Pilih **Add user** atau **Create new user**.
3. Masukkan email Owner dan password kuat yang berbeda dari password database. Simpan password hanya di password manager.
4. Setelah akun dibuat, salin nilai **User UID** akun tersebut.
5. Kembali ke **SQL Editor**, buat query baru, lalu jalankan perintah berikut setelah mengganti UUID contoh dengan User UID milikmu:

   ```sql
   insert into public.owners (user_id)
   values ('00000000-0000-0000-0000-000000000000');
   ```

Jangan menambahkan email atau UUID Owner ke JavaScript. RLS memeriksa keanggotaan melalui tabel `owners`.

## 4. Matikan pendaftaran publik

1. Buka **Authentication → Settings** (nama menu dapat sedikit berbeda pada dashboard).
2. Cari bagian **User Signups** atau **Allow new users to sign up**.
3. Matikan pendaftaran publik dan simpan perubahan.
4. Pastikan akun Owner yang sudah dibuat tetap ada di daftar Users dan UUID-nya terdaftar pada `owners`.

Pengunjung website tidak memerlukan akun untuk melihat data publik atau mengirim laporan/saran. Policy tidak memberi anon akses membaca kotak masuk tersebut.

## 5. Periksa konfigurasi publik aplikasi

1. Buka **Project Settings → API** (pada dashboard baru bisa disebut **API Keys**).
2. Pastikan Project URL dan anon/publishable key cocok dengan nilai publik di `assets/js/config.js`.
3. Jika mengganti nilai, ubah hanya Project URL dan key yang ditandai publik. Jangan kirim nilai tersebut di chat atau menaruhnya di tempat selain file konfigurasi.

Jangan mencari, menyalin, mengirim, atau menggunakan `service_role` / secret key. Jangan pernah menaruh password database, password akun Owner, atau kredensial administratif ke repositori. Service-role key melewati RLS dan tidak boleh digunakan di browser. Key publik bukan rahasia; RLS harus tetap aktif.

## 6. Backup

Ekspor website belum merupakan backup lengkap untuk tabel inbox privat atau objek Storage. Sebelum tindakan destruktif, buat cadangan database dan unduh objek Storage dari dashboard Supabase, lalu simpan di lokasi privat. Jangan unggah cadangan yang berisi informasi siswa, laporan, saran, foto, atau nomor telepon ke repositori publik. Data browser lama tidak dipindahkan otomatis.

## Status fase

Schema mendefinisikan tabel, RLS, bucket Storage, metadata version, dan publikasi Realtime untuk `records`. Setelah perubahan schema terbaru, jalankan kembali `schema.sql` di SQL Editor (script memakai `if not exists` dan mengganti policy yang dikelolanya), lalu verifikasi tabel, policy, bucket, dan publikasi. Jangan pernah memakai service-role key dari aplikasi browser. Checklist uji manual ada di `tests/rls-checklist.md`.
