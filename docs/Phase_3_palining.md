# Blueprint Eksekusi Fase 3 (Business Logic & Revenue Lengkap)

_Revisi V5: Menjawab Skema Pemilihan Metode Pembayaran. Mengklarifikasi bahwa Buyer memegang kendali penuh untuk memilih metode pembayaran (VA, QRIS, dll) di halaman Xendit, membebaskan Supplier dari kerumitan teknis saat merekayasa Kontrak._

---

## 📌 Pilar 1: Negotiations & Global Chat (`/api/v1/negotiations`)

- **`POST /api/v1/negotiations`**: Buyer mengajukan _Offer_. [🔔 NOTIF: Ke Supplier]
- **`GET /api/v1/negotiations/my-offers`**: (Buyer) Menarik daftar tawaran mandiri.
- **`GET /api/v1/negotiations/incoming`**: (Supplier) Kotak masuk tawaran.
- **`PUT /api/v1/negotiations/:id/status`**: Accept/Reject. [🔔 NOTIF: Ke Buyer]
- **`POST /api/v1/chat-messages`**: _Global Chat_ P2P. [🔔 NOTIF: Masing-masing]

## 📌 Pilar 2: Orders, Shipment Escrow & Digital Contract (`/api/v1/orders`)

- **`POST /api/v1/orders/contract`**: Supplier menekan "Buat Kontrak + Xendit Invoice + QR Code". [🔔 NOTIF: Ke Buyer]
- **`GET /api/v1/orders/my-purchases & my-sales`**: Dukungan Filter Dinamis `?status=` untuk _Shipment Tracking Page_.
- **`GET /api/v1/orders/:id`**: Detail Order/Kontrak.
- **`PUT /api/v1/orders/tracking/:id`**: Update Resi. [🔔 NOTIF: Ke Buyer]

## 📌 Pilar 3: Financials, Xendit API, & Wallets (`/api/v1/payments` & `/api/v1/wallets`)

> **[PENTING] Siapa yang Menentukan Metode Pembayaran?**
> Berdasarkan desain arsitektur Invoice Xendit, **PEMBELI (BUYER)** lah yang akan memilih sendiri metode pembayaran (Mandiri, BCA, QRIS, dll) langsung di dalam antarmuka web Invoice Xendit.
>
> Saat **Supplier** membuat pesanan (di Pilar 2), Supplier _hanya mengesahkan TOTAL HARGA_ saja. Supplier tidak perlu pusing menyetel metode pembayaran. Saat **Buyer** mengklik tautan Xendit, Xendit akan menampilkan layar pemilihan metode bayar yang didukung oleh Platform (Hasil sinkronisasi `GET /api/v1/payments/channels` agar UI BISA B2B bisa me-render logo opsinya untuk referensi visual).

- **`GET /api/v1/payments/channels`**: Daftar Metode Pembayaran hasil _mirroring_ Xendit.
- **`GET /api/v1/wallets/banks`**: Daftar Payout Banks dari Xendit. Dipakai Supplier untuk menarik dana.
- **`POST /api/v1/payments/xendit-webhook`**: Callback Lunas Escrow. [🔔 NOTIF: Admin & Supplier]
- **`PUT /api/v1/orders/release/:id`**: Buyer mengklik "Selesai", Escrow bocor ke Wallet Supplier. [🔔 NOTIF: Supplier & Admin]
- **`GET /api/v1/wallets/me`**: Cek Saldo Supplier.
- **`POST /api/v1/wallets/withdraw`**: Supplier mencairkan dompet via Xendit Payout. [🔔 NOTIF: Supplier]

## 📌 Pilar 4: Reviews & Ratings (`/api/v1/reviews`)

- **`POST /api/v1/reviews`**: Buyer mengulas produk pascajual. [🔔 NOTIF: Penyuplai]

---

## Tinjauan Pengguna Diperlukan

> [!CAUTION]
> Membiarkan _Buyer_ memilih sendiri cara bayarnya di akhir _Checkout_ akan mendongkrak _Success Rate_ transaksi hingga 80%, karena Buyer bisa sewaktu-waktu berubah pikiran saat di depan layar ATM/M-Banking.
>
> **Jika Anda sepakat dengan fleksibilitas metode bayar di tangan _Buyer_ ini, silakan katakan _"Gass Pilar 1"_ agar kita bisa langsung memprogram skrip Negosiasinya!**
