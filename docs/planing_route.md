# API Execution Sequence Plan

Dokumen ini merangkum prioritas eksekusi kode (Logic Audit & Bug Fixing) berdasarkan arsitektur model Prisma.

## Phase 1: Authentication & Identity (Highest Priority)

> **Goal:** Memastikan user bisa masuk ke dalam sistem dengan profil yang valid. Semua fitur lain bergantung pada JWT Token dari fase ini.

- **`/api/v1/auth/`**: Mengelola Autentikasi (Register, Login, OTP, Refresh Token). Method GET, POST, PUT, DELETE.
- **`/api/v1/users/`**: Mengelola Profil Pengguna, Dokumen KYC, Jam Operasional, dan Alamat Pengiriman Tambahan (`CustomerAddress`). Method GET, POST, PUT, DELETE.
- **`/api/v1/notifications/`**: Mengelola Notifikasi (Baca, Hapus). Method GET, PUT, DELETE.
- **`/api/v1/system/constants`**: Menarik data konstanta statis (Enums: _BiomassaType_, _PackagingType_, _VesselType_, dll) untuk _dropdown_ Front-End. Method GET.

## Phase 2: Core Marketplace & Geolocation (High Priority)

> **Goal:** Buyer harus bisa mencari Produk (Biochar/Biomassa) dari Supplier berdasarkan wilayah dan kategori.

- **`/api/v1/gis`**: Menarik data Geospasial (Negara, Provinsi, Kabupaten, Kecamatan, Desa). Method GET, POST, PUT, PATCH, DELETE. (Supplier/Buyer/Admin).
- **`/api/v1/categories`**: Method GET, POST, PUT, DELETE. Mengelola Kategori Produk (Biomassa, Biochar, dll).
- **`/api/v1/products`**: Method GET, POST, PUT, DELETE. Mengelola Produk (beserta relasi ProductTechnicalSpec dan ProductImage).
- **`/api/v1/suppliers`**: Method GET. Menarik direktori Profil Publik (_Company Profile_) dari Supplier yang terverifikasi (beserta rating dan _Partner_ information).

## Phase 3: Business Logic & Revenue (High Complexity)

> **Goal:** Mengunci alur pendapatan dari negosiasi hingga dana masuk escrow.

- **`/api/v1/negotiations`**: Method GET, POST, PUT. Inisiasi dan update status tawaran Buyer ke Supplier.
- **`/api/v1/chat-messages`**: Method GET, POST. Endpoint untuk obrolan tawar-menawar dalam Negosiasi.
- **`/api/v1/orders`**: Method GET, POST, PUT. Membuat `Order` (Checkout) dan melihat riwayat order.
- **`/api/v1/orders/tracking`**: Method GET, PUT. Melihat/Update data `ShipmentTracking`.
- **`/api/v1/transactions`**: Method GET. Melihat riwayat transaksi (Escrow, Wallet).
- **`/api/v1/payments`**: Mengelola metode pembayaran, webhook Xendit, dan data bank pencairan (`/channels`, `/webhook`, `/banks`). Method GET, POST.
- **`/api/v1/wallets`**: Method GET, POST. Melihat saldo dan request withdraw/payout.
- **`/api/v1/reviews`**: Mengelola ulasan (`Review`) dari Buyer ke Produk/Supplier setelah transaksi selesai. Method GET, POST, PUT, DELETE.

## Phase 4: Back Office - Admin & Governance (Back Office) [ACTIVE FOCUS]

> **Goal:** Portal kontrol penuh bagi administrator untuk mengelola keamanan, transaksi, KYC, dan konfigurasi platform. Ini adalah "Back Office" sistem.

- **`/api/v1/admin/dashboard`**: Method GET. Menarik metrik statistik ringkas (Total GMV, Total User, Volume Biomassa) untuk overview _dashboard_ internal admin.
- **`/api/v1/admin/users`**: Method GET, PATCH. Manajemen pengguna (Listing, Search) dan kontrol status (Block/Unblock). Verifikasi dokumen KYC (KTP/NIB).
- **`/api/v1/admin/channels`**: Mengelola Master Data fundamental seperti Rekening Platform (`PlatformBankAccount`) dan Nilai Potongan Biaya (`PlatformFeeSetting`). Fitur **Kill-Switch** untuk mematikan metode pembayaran tertentu secara real-time.
- **`/api/v1/admin/transactions`**: Method GET. Melihat seluruh transaksi platform secara transparan untuk kebutuhan audit.

---

## Phase 5: Buyer & Supplier Experience (Extended Logic)

> **Goal:** Memastikan user dapat berinteraksi dengan platform secara maksimal, termasuk pemberian ulasan dan manajemen notifikasi yang lebih rapi.

- **`/api/v1/notifications`**: Method PATCH. Menandai notifikasi sebagai "Sudah Dibaca" (`isRead`).
- **`/api/v1/reviews`**: Mengelola ulasan (`Review`) dari Buyer ke Produk/Supplier setelah transaksi selesai. Method GET, POST, PUT, DELETE.
- **`/api/v1/cms`**: Mengelola seluruh konten dinamis CMS (Pages, Sections, Cards, FAQs, Menus, Policies). Method GET, POST, PUT, DELETE.
- **`/api/v1/articles`**: Mengelola berita dan literasi karbon (`Article`). Method GET, POST, PUT, DELETE.

---

## Phase 6: Ecosystem Value-Adds (IoT & AI Predictor)

> **Goal:** Tahap integrasi teknologi mutakhir (IoT dan AI) untuk mengotomatisasi produksi biochar dan prediksi kualitas.

- **`/api/v1/iot`**: Manajemen perangkat IoT Supplier, telemetri (suhu/kelembaban), dan notifikasi anomali. Method GET, POST, PUT, DELETE.
- **`/api/v1/ai/predict`**: Method GET, POST. Estimasi Yield dan Grade Biochar dari model AI (XGBoost & Gemini).
- **`/api/v1/forum`**: Komunitas diskusi petani/supplier (Posts & Comments). Method GET, POST, PUT, DELETE.
- **`/api/v1/analytics`**: Peta sebaran limbah dan indeks `MarketTrend` untuk dashboard publik. Method GET.

---

NOTE:
APi enpoint path di sesaikna sesai kebutuhan

## Resolusi Error Migrasi (Wajib Dieksekusi Anda)

Karena keterbatasan akses sandbox saya untuk menjalankan bash command kompleks di Windows secara otomatis, Anda harus menjalankan urutan perintah ini di terminal Anda secara manual untuk "mengobati" drift database:

1. `npx prisma migrate reset --force`
2. `npx prisma db push`
3. `npm run seed`
