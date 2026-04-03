# Phase 5 Plan: Integrasi IoT Monitoring (Real-time Telemetry)

## 📌 Latar Belakang

Sesuai rancangan pada _Tahap 3 (MVP Extended)_, fitur IoT Monitoring merupakan salah satu nilai jual utama aplikasi BISA. Fitur ini memungkinkan pengguna (khususnya Supplier/Petani Binaan) untuk memantau suhu tungku pembakaran biochar secara real-time dan mencegah kegagalan produksi (overheating atau suhu terlalu rendah).

**PENTING**: Sesuai dengan proposal bisnis, **fitur IoT ini bersifat PRO / Premium Berbayar**. Hal ini dikarenakan fitur IoT melibatkan implementasi fisik (pemasangan hardware/alat pada tungku) dan pendampingan masyarakat langsung. Secara default, akun petani adalah **FREE**, dan _dashboard_ IoT akan tergembok. Petani harus mendaftar paket langganan (Subscribe) baik bulanan atau tahunan untuk mengakses fitur ini.

## 🎯 Tujuan (Objective)

1. Membatasi akses layanan IoT HANYA untuk "Supplier" yang akunnya berstatus `PRO` (telah berlangganan), yang divalidasi via _Middleware_.
2. Memfasilitasi konfigurasi harga langganan (Rp 50.000/bulan) melalui `PlatformFeeSetting`.
3. Menyesuaikan tipe data service dan controller agar sinkron dengan Prisma Schema v7 (penggunaan UUID).
4. Mengimplementasikan logika peringatan dini (Alerts) berdasarkan ambang batas suhu.
5. Menghubungkan peringatan (Alerts) dari IoT dengan sistem Notifikasi.

## 📝 Daftar Task (Issue Breakdown)

### 1. Sistem Pembatasan Akses IoT (PRO Tier Midleware)

- **File**: `src/middlewares/authMiddleware.ts` (atau file middleware baru)
- **Tugas**:
  - Buat _middleware_ khusus (contoh: `requireTierPro`) yang memvalidasi bahwa `req.user.tier === 'PRO'` (enum `UserTier`) dan tenggat waktu `req.user.subscriptionExpiresAt` masih berlaku.
  - Jika bukan pengguna PRO, middleware harus mengembalikan status `403 Forbidden` dengan pesan edukatif mengarahkan pengguna (Supplier) untuk melakukan pendaftaran / langganan.

### 2. Implementasi Pembayaran Langganan via Xendit (IoT Subscribe)

- **File**: `src/services/iot.service.ts`, `src/controllers/iot.controller.ts`, `src/routes/iot.ts`
- **Tugas**:
  - Buat **API Endpoint** `POST /api/v1/iot/subscribe` khusus bagi _Supplier/Petani_.
  - Ambil tarif dasar (misal Rp50.000) dari tabel `PlatformFeeSetting` (Tipe Enum: `SUBSCRIPTION`).
  - Buat `Transaction` (Tipe: `SUBSCRIPTION`, Status: `PENDING`) di basis data agar historinya dapat dilihat di _Dashboard_ Admin.
  - Terapkan **Direct Payment Integration** (In-App Transaction) lewat Xendit via Virtual Account / QRIS / E-Wallet langsung, dan BUKAN berupa _Payment Link_ eksternal. Server mengembalikan data instruksi pembayaran (seperti Nomor VA atau QRIS String) agar _Frontend_ (UI BISA) bisa menampilkannya tanpa _redirect_ ke _tab_ baru. Hal ini akan meningkatkan kepercayaan dan rasa aman bagi Petani.

### 2.b. Penanganan Webhook Pembayaran Langganan (Xendit Callback)

- **File**: `src/services/payment.service.ts` (Webhook Handler)
- **Tugas**:
  - Saat Xendit mengirim pembaruan status `PAID`, periksa jenis transaksinya (`TransactionType.SUBSCRIPTION`).
  - Lakukan _Database Transaction_ atomic:
    1. Ubah status transaksi menjadi berhasil (`RELEASED` / `SUCCESS`).
    2. Ubah `User.tier` milik petani menjadi `PRO` (berlangganan aktif).
    3. Perpanjang nilai `User.subscriptionExpiresAt` selama 1 Bulan ke depan.

### 3. Refactoring Tipe Data IoT Service & Controller (UUID)

- **File**: `src/services/iot.service.ts`, `src/controllers/iot.controller.ts`
- **Tugas**:
  - Ubah parameter userId, deviceId dari `number` menjadi `string` (UUID).
  - Pastikan operasi database memanggil model dengan benar (`iotReading`, `iotAlert` sesuai standar generasi Prisma).
  - Hapus _type-casting_ `Number(deviceId)` di sisi controller.

### 4. Implementasi Multi-Threshold Alert Logic

- **File**: `src/services/iot.service.ts`
- **Tugas**:
  - Pertahankan logika peringatan `OVERHEATING` jika suhu pembakaran terdeteksi tinggi (misal: > 600°C).
  - Tambahkan peringatan `TEMP_TOO_LOW` (< 200°C) di tengah siklus aktif.
  - Gunakan nilai dari enum `IoTAlertType` dalam pencatatan peringatan (Alerts).

### 5. Integrasi Notifikasi Real-time

- **File**: `src/services/iot.service.ts`
- **Tugas**:
  - Impor `notification.service.ts` dan jalankan fungsi `sendNotification` setiap kali ada _Alert_ suhu ekstrem (Overheating / Underheating).

### 6. Endpoint Pendaftaran & Pengelolaan Perangkat IoT (Dilindungi PRO)

- **File**: `src/routes/iot.ts`, `src/controllers/iot.controller.ts`
- **Tugas**:
  - Suntikkan _middleware_ `requireTierPro` pada seluruh rute API `/api/v1/iot`.
  - Sempurnakan operasi API `GET /api/v1/iot/devices` untuk me-list semua perangkat IoT milik _Supplier_ (Petani Binaan).
  - Tambahkan fitur hapus `DELETE /api/v1/iot/devices/:deviceId` untuk dekoneksi atau pencabutan alat IoT.

### 7. Integrasi Dashboard Admin untuk Memonitor Langganan (PRO/FREE)

- **File**: `src/services/admin.service.ts`
- **Tugas**:
  - Refaktor layanan `listUsers` yang sudah ada agar mendukung parameter pencarian baru: `tier` (untuk memfilter `PRO` / `FREE`).
  - Tambahkan bidang `tier` dan `subscriptionExpiresAt` ke dalam _select query_ Prisma, agar data ini terikut dalam _response_ API yang dikirim ke Dashboard Admin.

---

**Status**: Siap Dikerjakan (Ready to Start)
