# Panduan Deploy Kedai Kasir (Supabase + Vercel)

Ikuti urutan ini dari atas ke bawah. Semua bisa dikerjakan lewat browser,
tidak perlu install apa pun di komputer.

---

## BAGIAN A — Supabase (database)

### A1. Kalau belum pernah bikin project Supabase
1. Buka https://supabase.com → **Start your project** → login pakai GitHub.
2. **New Project** → kasih nama (mis. `kedai-kasir`) → buat password database
   (simpan baik-baik) → region **Southeast Asia (Singapore)** → **Create**.
3. Tunggu 1-2 menit sampai statusnya siap.

### A2. Jalankan cetakan database
1. Di sidebar kiri, klik **SQL Editor** → **New query**.
2. Buka file **`supabase_schema.sql`**, copy semua isinya, tempel di situ,
   klik **Run**. Tunggu sampai muncul "Success".
3. Buat query baru lagi → buka file **`supabase_schema_patch1.sql`**,
   copy-tempel, klik **Run** juga (ini nambah 2 kolom kecil yang kelewatan
   di skema awal — aman dijalankan kapan saja).

> Kalau kamu SUDAH pernah menjalankan `supabase_schema.sql` di sesi
> sebelumnya, cukup jalankan `supabase_schema_patch1.sql` saja.

### A3. Buat akun login kasir
1. Sidebar kiri → **Authentication** → tab **Users** → **Add user** →
   **Create new user**.
2. Isi email & password kamu sendiri (ini yang dipakai buat masuk Mode
   Kasir nanti, gantinya PIN 4 digit yang lama).
3. Centang **Auto Confirm User** kalau ada opsinya, lalu **Create user**.

### A4. Ambil kunci API
1. Sidebar kiri → **Settings** (ikon gerigi) → **API**.
2. Catat 2 nilai ini:
   - **Project URL** (bentuknya `https://xxxxx.supabase.co`)
   - **anon public** key (teks panjang di bagian "Project API keys")

---

## BAGIAN B — Siapkan kode di komputer/GitHub

### B1. Isi kunci Supabase ke kode
1. Di folder project, cari file **`.env.example`**.
2. Ganti isinya jadi punya kamu sendiri, lalu **ganti nama file** dari
   `.env.example` menjadi **`.env`** (buang `.example`-nya):
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=isi-anon-key-kamu
   ```
   *(File `.env` ini sengaja TIDAK ikut ke GitHub — lihat langkah B3.
   Nanti nilai yang sama dimasukkan lagi langsung di Vercel pada Bagian C.)*

### B2. Upload ke GitHub (tanpa install apa pun)
1. Buka https://github.com → tombol hijau **New** (bikin repository baru).
2. Kasih nama, mis. `kasir-kedai` → boleh pilih **Private** kalau tidak
   mau kodenya kelihatan orang lain → **Create repository**.
3. Di halaman repo kosong itu, klik link **"uploading an existing file"**.
4. **Drag & drop SEMUA file dan folder** project ini ke situ (folder
   `src` ikut ter-upload otomatis kalau di-drag sebagai folder).
5. Scroll ke bawah, klik **Commit changes**.

### B3. Pastikan `.env` tidak ikut ke GitHub
File `.gitignore` yang sudah disertakan otomatis mencegah `.env` ke-upload
kalau kamu pakai `git` biasa. Tapi kalau upload manual lewat web tadi,
**jangan drag file `.env`** — cukup `.env.example` saja yang boleh ikut.
Kunci Supabase yang asli nanti diisi langsung di Vercel (Bagian C2), bukan
di file yang tersimpan di GitHub.

---

## BAGIAN C — Deploy ke Vercel

### C1. Hubungkan ke GitHub
1. Buka https://vercel.com → **Continue with GitHub**.
2. **Add New...** → **Project**.
3. Cari & pilih repository `kasir-kedai` yang baru diupload → **Import**.

### C2. Isi kunci Supabase
Sebelum klik Deploy, buka bagian **Environment Variables**, tambahkan 2 baris:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | *(Project URL dari langkah A4)* |
| `VITE_SUPABASE_ANON_KEY` | *(anon public key dari langkah A4)* |

### C3. Deploy
Klik **Deploy**. Tunggu 1-2 menit. Kalau berhasil, Vercel kasih link
seperti `kasir-kedai.vercel.app` — buka link itu, aplikasinya sudah bisa
dipakai dari HP mana pun.

---

## Checklist tes setelah online

1. Buka link Vercel-nya → pilih **Mode Kasir** → login pakai email/password
   dari langkah A3.
2. Coba tambah 1 produk baru di tab Menu.
3. Coba lakukan 1 transaksi jualan.
4. Buka **Web Pelanggan** di tab/HP lain → daftar akun baru pakai nomor HP →
   cek strukmu muncul (kalau tadi isi nomor HP yang sama saat checkout).
5. Coba tombol **Buka/Tutup** kedai di kasir → cek Web Pelanggan ikut berubah.

## Kalau ada error

- **Halaman putih kosong** → biasanya `VITE_SUPABASE_URL`/`ANON_KEY` belum
  keisi di Vercel (langkah C2), atau salah ketik. Cek di Vercel → Settings →
  Environment Variables, betulkan, lalu **Redeploy**.
- **"row-level security policy" / "permission denied"** saat pakai fitur
  tertentu → biasanya `supabase_schema_patch1.sql` belum dijalankan, atau
  ada tabel yang gagal ke-create — buka SQL Editor, jalankan ulang
  `supabase_schema.sql`, aman dijalankan berkali-kali.
- **Email/password salah saat login kasir** → cek lagi di Supabase →
  Authentication → Users, pastikan user-nya ada & sudah "Confirmed".
- Kalau errornya belum ada di daftar ini, kirim saja pesan error persis
  yang muncul (biasanya kelihatan di console browser — klik kanan halaman
  → Inspect → tab Console) — nanti saya bantu telusuri.
