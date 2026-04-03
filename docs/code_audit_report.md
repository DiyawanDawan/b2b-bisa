# Code Audit Report - Backend

Tanggal audit: 2026-04-02

## Ruang Lingkup
- Schema: `prisma/schema.prisma`
- Enum: Prisma enums di schema
- Controller: `src/controllers/**`
- Service (business logic): `src/services/**`
- Validasi: `src/validations/**`
- Middleware dan utilitas pendukung: `src/middlewares/**`, `src/utils/**`
- Tidak mengaudit: `node_modules/**`, `generated/**`

## Metode
Audit statik berbasis pembacaan kode (tanpa eksekusi). Fokus pada:
- Query optimization (N+1, index, pola query)
- Response format dan konsistensi field
- Bug dan potensi kritikal
- Retry/rotating logic pada external call
- Validasi berbasis schema/enum dinamis (tanpa hardcode)

## Ringkasan
Temuan utama berada pada:
- Validasi dan penggunaan enum yang masih hardcode (prioritas tinggi).
- Bug runtime pada flow kontrak/pembayaran.
- Kontrol akses IoT (IDOR) dan routing conflict.
- Optimasi query (index dan pola pencarian).

## Temuan (Format Tabel)
| Lokasi file:baris                                        | Jenis masalah | Prioritas | Penjelasan singkat                                                                            | Saran perbaikan                                                                    |
|----------------------------------------------------------|---------------|-----------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `src/routes/users.ts:13-17`                              | bug           | Tinggi    | `GET /users/me` tidak pernah terjangkau karena `/:id` dideklarasikan lebih dulu.              | Pindahkan semua route `/me` dan `/me/*` di atas `/:id`.                            |
| `src/services/order.service.ts:57-62`                    | bug           | Tinggi    | `feeSetting` digunakan tetapi tidak didefinisikan, akan crash saat create contract.           | Tambahkan query `feeSetting` sebelum digunakan.                                    |
| `src/services/order.service.ts:104`                      | bug           | Tinggi    | `NegotiationStatus` dipakai tapi tidak di-import, build gagal.                                | Tambahkan `NegotiationStatus` ke import dari `#prisma`.                            |
| `src/routes/iot.ts:69-74`                                | keamanan      | Tinggi    | `GET /iot/data/:deviceId` tidak membatasi role, user PRO non-supplier bisa akses data device. | Tambahkan `requireRole(UserRole.SUPPLIER, UserRole.ADMIN)` di route ini.           |
| `src/services/iot.service.ts:34-131`                     | keamanan      | Tinggi    | Tidak ada verifikasi kepemilikan device pada telemetry dan dashboard (IDOR).                  | Validasi `device.userId === req.user.id` pada log dan read.                        |
| `src/services/storage.service.ts:21-22,41-42`            | keamanan      | Tinggi    | `JWT_SECRET` fallback ke string statik melemahkan signing.                                    | Wajibkan `JWT_SECRET` dan fail-fast bila kosong.                                   |
| `src/validations/auth.validation.ts:15-21,33-36,97-100`  | validasi      | Tinggi    | Enum role/type di-hardcode, tidak dinamis dari schema.                                        | Ganti ke `z.nativeEnum(Prisma.UserRole)`/`z.nativeEnum(Prisma.TokenType)`.         |
| `src/validations/product.validation.ts:3-35,53-55,71-72` | validasi      | Tinggi    | Enum produk di-hardcode (biomassa, grade, status, unit).                                      | Gunakan `z.nativeEnum(Prisma.BiomassaType/BiocharGrade/ProductStatus/UnitStatus)`. |
| `src/validations/device.validation.ts:25-27,43-47`       | validasi      | Tinggi    | Threshold dan method payment di-hardcode.                                                     | Tarik dari schema/enum atau konfigurasi DB.                                        |
| `src/services/user.service.ts:303`                       | validasi      | Tinggi    | Status produk `'ACTIVE'` di-hardcode.                                                         | Gunakan `ProductStatus.ACTIVE`.                                                    |
| `src/services/order.service.ts:34-36`                    | validasi      | Tinggi    | Status negosiasi `'OFFER_ACCEPTED'` di-hardcode.                                              | Gunakan `NegotiationStatus.OFFER_ACCEPTED`.                                        |
| `src/services/payment.service.ts:45,103,175,241,297`     | validasi      | Tinggi    | Status webhook vendor di-hardcode (PAID/EXPIRED/SUCCEEDED/FAILED/VOIDED).                     | Bungkus ke enum/mapper dinamis agar konsisten.                                     |
| `src/services/order.service.ts:231-238`                  | validasi      | Tinggi    | `GROUP_CONFIG` hardcode untuk mapping payment method.                                         | Simpan mapping di DB/enum terpusat.                                                |
| `src/services/order.service.ts:315-321`                  | validasi      | Tinggi    | `invoiceDuration` dan fallback kategori hardcode.                                             | Pindahkan ke konfigurasi DB.                                                       |
| `src/services/ai.service.ts:20-33,45-46`                 | validasi      | Tinggi    | Threshold prediksi dan default output hardcode.                                               | Tarik dari konfigurasi DB atau model config.                                       |
| `src/utils/env.util.ts:14`                               | bug           | Sedang    | `DATABASE_URL` diwajibkan padahal koneksi memakai `DATABASE_HOST` dkk.                        | Selaraskan strategi env.                                                           |
| `src/services/order.service.ts:345-346`                  | bug           | Sedang    | `invoiceUrl` mengambil field `invoiceUrl` (camelCase) padahal data `invoice_url`.             | Map ke `invoice_url` secara eksplisit.                                             |
| `src/middlewares/rateLimiter.ts:10-12`                   | keamanan      | Sedang    | `x-forwarded-for` dipakai tanpa `trust proxy`, mudah dibypass.                                | Set `app.set('trust proxy', ...)` atau validasi header dari proxy tepercaya.       |
| `src/services/ai.service.ts:97-105`                      | optimasi      | Sedang    | Call eksternal (Gemini) tanpa retry/timeout.                                                  | Gunakan `withRetry` + `AbortController`.                                           |
| `src/services/storage.service.ts:51-58,117-123`          | optimasi      | Sedang    | Call R2/S3 tanpa retry/backoff.                                                               | Bungkus `r2Client.send` dengan `withRetry`.                                        |
| `prisma/schema.prisma:1269`                              | optimasi      | Sedang    | `CustomerAddress` tidak punya index `userId` padahal query pakai `where userId`.              | Tambahkan `@@index([userId])` dan/atau `@@index([addressId])`.                     |
| `prisma/schema.prisma:334`                               | optimasi      | Sedang    | `Token` tidak punya index `token` atau `(userId, type)`.                                      | Tambahkan `@@index([token])` dan `@@index([userId, type])`.                        |
| `src/services/product.service.ts:133-135`                | optimasi      | Sedang    | Pencarian `contains` tanpa FULLTEXT index.                                                    | Tambahkan FULLTEXT index atau search service.                                      |
| `src/services/admin.service.ts:205-206`                  | optimasi      | Sedang    | Pencarian `contains` pada email/fullName tanpa index khusus.                                  | Tambahkan FULLTEXT/BTREE sesuai kebutuhan.                                         |
| `src/services/user.service.ts:43-61`                     | optimasi      | Rendah    | `include` banyak relasi address per alamat, payload besar.                                    | Gunakan `select` minimal atau lazy-load detail.                                    |

## Rotating / Retry Logic
- Ada retry `withRetry` pada Xendit PaymentRequest dan Payout.
- Belum ada retry/timeout untuk Gemini API dan R2/S3.
- Tidak ada rotating/fallback provider untuk external calls.


## Catatan
Dokumen ini fokus pada struktur temuan dan prioritas teknis. Rekomendasi implementasi dapat ditindaklanjuti bertahap sesuai risiko dan beban perubahan.
