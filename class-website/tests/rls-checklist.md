# Checklist manual Supabase RLS

Jalankan setelah `supabase/schema.sql` berhasil dan akun Owner terdaftar pada `public.owners`. Gunakan satu sesi anonim biasa dan satu sesi Owner. Jangan menguji dengan `service_role` key karena key itu melewati RLS.

## Sesi anon

- [ ] SELECT `records` hanya menampilkan baris `deleted_at IS NULL`.
- [ ] Baris soft-delete tidak terlihat melalui SELECT anon.
- [ ] INSERT, UPDATE, dan DELETE `records` ditolak (RLS / permission denied).
- [ ] INSERT report dengan nama/pesan yang valid berhasil.
- [ ] INSERT report dengan nama kosong, pesan kosong, atau pesan lebih dari 5000 karakter ditolak.
- [ ] SELECT, UPDATE, dan DELETE `reports` ditolak; isi laporan tidak dapat dibaca anon.
- [ ] INSERT suggestion dengan judul/pesan yang valid berhasil.
- [ ] INSERT suggestion dengan judul kosong, judul lebih dari 160 karakter, atau pesan lebih dari 5000 karakter ditolak.
- [ ] SELECT, UPDATE, dan DELETE `suggestions` ditolak; kotak saran tidak dapat dibaca anon.
- [ ] SELECT, INSERT, UPDATE, dan DELETE `activity_log` ditolak.
- [ ] SELECT objek pada bucket `gallery` berhasil untuk objek yang ada.
- [ ] INSERT gambar yang sesuai tipe/MIME dan batas ukuran ke `gallery` ditolak.
- [ ] INSERT gambar yang sesuai tipe/MIME dan batas ukuran ke `report-attachments` diperbolehkan.
- [ ] SELECT objek `report-attachments` ditolak dan bucket tidak menghasilkan URL publik yang dapat dibaca.
- [ ] SELECT data membership `owners` tidak tersedia bagi anon.

## Sesi Owner terautentikasi

- [ ] SELECT `owners` hanya mengembalikan membership UUID akun Owner yang sedang login.
- [ ] SELECT `records` mengembalikan baris aktif dan baris soft-delete untuk semua koleksi yang diizinkan.
- [ ] INSERT record berhasil dengan UUID baru dan versi awal 1.
- [ ] UPDATE record dengan versi dasar yang cocok berhasil; trigger menaikkan `version`, memperbarui `updated_at`, dan mencatat `updated_by`.
- [ ] Dua sesi Owner membaca versi yang sama; setelah sesi pertama memperbarui, update bersyarat sesi kedua dengan versi lama memengaruhi nol baris dan harus dianggap konflik.
- [ ] Soft-delete record dengan mengisi `deleted_at`; baris hilang dari anon tetapi tetap terlihat Owner.
- [ ] Restore record dengan mengosongkan `deleted_at`; baris kembali terlihat anon.
- [ ] Hard-delete record berhasil hanya melalui tindakan Owner yang dikonfirmasi.
- [ ] SELECT, UPDATE, dan DELETE reports/suggestions berhasil; INSERT tetap dibatasi sesuai grants.
- [ ] SELECT, INSERT, UPDATE, dan DELETE `activity_log` berhasil sebagai Owner.
- [ ] INSERT, UPDATE, DELETE objek bucket `gallery` berhasil; objek terbaca publik.
- [ ] SELECT objek `report-attachments` berhasil; INSERT dari sesi Owner tidak diperlukan oleh policy fase ini.

## Pengguna login yang bukan Owner

- [ ] Buat akun uji sementara yang tidak tercantum di `owners`.
- [ ] Login sebagai akun tersebut; ia dapat membaca record aktif saja.
- [ ] Semua INSERT, UPDATE, DELETE shared records dan akses inbox/activity log ditolak.
- [ ] Upload/perubahan gallery oleh akun non-Owner ditolak; objek report-attachments tidak dapat dibaca.
- [ ] Hapus akun uji setelah pengujian selesai.

## Catatan hasil

| Tanggal | Sesi | Kasus | Hasil yang diamati | PASS/FAIL |
|---|---|---|---|---|
|  |  |  |  |  |

Pengguna anonim tidak boleh menulis ke data bersama/inbox; sesuai desain, anon hanya boleh mengirim report, suggestion, dan lampiran report yang dibatasi. Policy tidak membatasi laju permintaan jaringan; jika diperlukan, tambahkan proteksi abuse terpisah sebelum publikasi.
