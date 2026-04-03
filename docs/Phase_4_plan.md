# Dokumentasi Arsitektur: Phase 4 - Back Office & Governance (BISA B2B)

Dokumen ini adalah cetak biru (blueprint) utama untuk pusat kendali operasional Administrator platform BISA B2B. Fase ini bertujuan untuk memastikan tata kelola platform yang transparan, aman, dan dapat diaudit sepenuhnya.

---

## 1. Arsitektur Inti & Keamanan

Fase ini membutuhkan kontrol akses yang sangat ketat ("Elite Architecture") untuk melindungi manajemen finansial dan operasional platform.

- **Pemisahan Folder**: Seluruh rute, controller, dan logika bisnis admin diisolasi agar tidak tercampur dengan flow user/public.
  - `src/routes/admin/`
  - `src/controllers/admin.controller.ts`
  - `src/services/admin.service.ts`
- **Keamanan Middleware**:
  - Diciptakan `src/middlewares/isAdmin.ts`, sebuah middleware khusus untuk validasi Role mutlak (`ADMIN`).
  - Middleware ini diterapkan ke tingkat _root router_ di `src/routes/admin/index.ts`, sehingga seluruh endpoint di bawahnya terlindungi.
- **Audit Logging**: Setiap aksi krusial (contoh: pemutusan sengketa/dispute) me-record perubahan permanen ke tabel `AuditLog`.

---

## 2. Spesifikasi Endpoint (Granular API)

Untuk performa Frontend (dashboard) yang maksimal dan mendukung _lazy-loading_, endpoint dipecah menjadi unit-unit granular yang terstruktur.

### A. Dashboard & Elite Analytics (`/api/v1/admin/dashboard`)

Fokus pada metrik operasional dan data chart (siap dipakai oleh React ApexCharts: `[{ x, y }]` atau `{ labels, series }`).

| Method | Endpoint              | Deskripsi Fungsi                                                                        |
| :----- | :-------------------- | :-------------------------------------------------------------------------------------- |
| `GET`  | `/stats`              | **KPI Utama & Sparkline**: Total GMV, User Baru, Order (berserta tren 7 hari terakhir). |
| `GET`  | `/biomass-trend`      | **Line Chart**: Data tren volume penjualan biomassa harian.                             |
| `GET`  | `/charts/revenue`     | **Area Chart**: Data peningkatan pendapatan kotor platform secara bulanan.              |
| `GET`  | `/charts/users`       | **Donut Chart**: Demografi user berdasarkan status (Aktif/Ban) & Role.                  |
| `GET`  | `/charts/categories`  | **Radar/Pie Chart**: Analisis proporsi transaksi per jenis kategori produk.             |
| `GET`  | `/charts/performance` | **Bar Chart**: Ranking _Top 5 Suppliers_ penyumbang GMV tertinggi.                      |

---

### B. User & Identity Governance (`/api/v1/admin/users`)

Fokus pada audit entitas pengguna dan persetujuan otentikasi KYC.

| Method  | Endpoint                | Deskripsi Fungsi                                                                          |
| :------ | :---------------------- | :---------------------------------------------------------------------------------------- |
| `GET`   | `/`                     | **List Users**: Tabel pengguna dengan filter (Role, Status) dan Paginasi.                 |
| `GET`   | `/:id/dossier`          | **Dossier 360°**: Profil gabungan (Wallet, Produk, Histori Order) untuk deteksi penipuan. |
| `PATCH` | `/:id/status`           | **Status Control**: Memblokir (Ban) atau Mengaktifkan (Unban) akun pengguna.              |
| `GET`   | `/verifications`        | **KYC Queue**: Antrean user yang mendaftar dan menunggu persetujuan identitas (KTP/NIB).  |
| `PATCH` | `/verifications/review` | **Approve/Reject**: Keputusan Admin atas ajuan KYC (menyertakan alasan jika ditolak).     |

---

### C. Product Moderation & Market Control (`/api/v1/admin/products`)

Fokus pada jaminan mutu (Quality Control) produk dan manajemen tipe/kategori di marketplace. Dokumentasi di bawah sangat detail agar mudah dipahami programmer junior atau AI.

| Method  | Endpoint          | Deskripsi Fungsi                                                                                                             |
| :------ | :---------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/`               | **Audit Listing**: Menampilkan seluruh data produk (`Produk` model) untuk diaudit oleh Admin.                                |
| `PATCH` | `/:id/certify`    | **Sertifikasi BISA**: Memberikan _badge_ "Verified Quality" (`isCertified: true/false`). Body: `{ isCertified: boolean }`    |
| `PATCH` | `/:id/moderate`   | **Takedown/Aktivasi**: Mengubah status tayang (contoh: BLOCKED, ACTIVE) jika melanggar ketentuan. Body: `{ status: string }` |
| `GET`   | `/categories`     | **List Master Kategori**: Mengambil seluruh daftar kategori biomassa induk (`Category` model).                               |
| `POST`  | `/categories`     | **Tambah Kategori**: Membuat kategori produk biomassa baru. Body input mencakup _name_ dan _categoryType_.                   |
| `PUT`   | `/categories/:id` | **Update Master Kategori**: Mengubah detail data kategori (seperti nama/deskripsi) berdasarkan ID-nya.                       |

---

### D. Financial & Fee Management (`/api/v1/admin/finance`)

Fokus pada transparansi anti-bocor keuangan platform dan konfigurasi biaya (_fee/tax_).

| Method  | Endpoint        | Deskripsi Fungsi                                                                                                              |
| :------ | :-------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/stats`        | **Escrow Monitor**: Memantau perputaran uang: dana di Escrow vs rilis vs refund.                                              |
| `GET`   | `/transactions` | **Global Ledger**: Buku besar riwayat aliran dana mutlak dari seluruh transaksi.                                              |
| `GET`   | `/fees`         | **Konfigurasi Fee**: Menampilkan biaya admin, pajak, dan subscription ter-setup saat ini.                                     |
| `POST`  | `/fees`         | **Tambah Fee Baru**: Menambahkan aturan potong biaya (fee) baru untuk platform. Body: `{ name, amount, type, isActive, dll }` |
| `PATCH` | `/fees/:id`     | **Update Fee**: Mengaktifkan/menonaktifkan atau mengubah nominal/persentase komisi (`amount`, `isActive`).                    |

---

### E. Order & Dispute Arbitration (`/api/v1/admin/orders`)

Fokus pada manajemen sengketa antara _Buyer_ dan _Seller_.

| Method | Endpoint        | Deskripsi Fungsi                                                                                                                     |
| :----- | :-------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/disputes`     | **Queue Sengketa**: Menampilkan daftar pesanan dengan status `DISPUTED`.                                                             |
| `GET`  | `/disputes/:id` | **Review Sengketa**: Membaca log negosiasi dan melihat bukti foto komplain.                                                          |
| `POST` | `/:id/resolve`  | **Arbiter Final**: Admin memaksa uang kembali ke Buyer (`REFUND`) atau uang dirilis ke Supplier (`RELEASE`). Tercatat di `AuditLog`. |

---

## 3. Catatan untuk Developer (Testing / UAT)

Untuk menguji fitur-fitur di dalam modul ini, ikuti langkah berikut:

1.  **Test Unauthorized Akses**: Panggil endpoint `GET /api/v1/admin/dashboard/stats` tanpa JWT Token. Pastikan responnya `401 Unauthorized`.
2.  **Test Akses Buyer/Seller**: Login sebagai _BUYER_ biasa, panggil rute admin. Pastikan responnya `403 Forbidden` (diblokir oleh middleware `isAdmin`).
3.  **Visualisasi Data Chart**: Data yang keluar dari `/charts/*` wajib berformat array (contoh: `[{x: '2023-01', y: 400}]`) sehingga Developer Frontend **TIDAK PERLU** melakukan for-loop berlebihan. Datanya siap disuapkan ke _props_ ApexCharts atau library sejenis.

## 4. Keperluan Ekstensi Lainnya (Open Questions)

- **Sistem Notifikasi**: Belum ada endpoint khusus Broadcast. Dapat ditambahkan pada iterasi mendatang jika diperlukan (`POST /admin/notifications/broadcast`).
- **Export Laporan**: Ekspor `.csv` atu `.pdf` untuk data keuangan mungkin dapat dikembangkan sebagai Service/Worker terpisah.
