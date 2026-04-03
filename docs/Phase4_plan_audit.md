# 🔍 LAPORAN AUDIT AKHIR — BISA B2B Backend (Phase 1–4)

**Tanggal:** 2 April 2026  
**Auditor:** Antigravity AI  
**Cakupan:** Seluruh file di `src/services/`, `src/controllers/`, `src/routes/`, `src/validations/`, `src/middlewares/`

---

## Ringkasan Temuan

| Tingkat           | Jumlah | Status                               |
| ----------------- | ------ | ------------------------------------ |
| CRITICAL          | 3      | Harus diperbaiki SEBELUM deploy      |
| TINGGI (High)     | 4      | Harus diperbaiki dalam sprint ini    |
| MENENGAH (Medium) | 5      | Sebaiknya diperbaiki sebelum scaling |
| RENDAH (Low)      | 6      | Perbaikan jangka panjang             |

---

## 1. CRITICAL BUGS

### CRITICAL-01: Refund Buyer TIDAK Atomic — Dana Bisa Hilang

**File:** `src/services/wallet.service.ts` -> `refundToBuyer()`

**Masalah:** Fungsi ini menjalankan 2 operasi database TERPISAH (bukan dalam satu `$transaction`). Jika server crash setelah update Order tapi sebelum update Transaction, Order sudah CANCELLED tapi uang TIDAK dikembalikan ke buyer.

**Solusi:** Bungkus kedua operasi dalam `prisma.$transaction(async (tx) => { ... })`

---

### CRITICAL-02: Webhook Xendit PAID Tidak Return Hasil

**File:** `src/services/payment.service.ts` -> `handleXenditWebhook()` blok status PAID

**Masalah:** Setelah `prisma.$transaction(...)` tidak ada `return`. Flow jatuh ke `return transaction` yang mengembalikan data LAMA.

**Solusi:** Tambahkan `return` di depan `prisma.$transaction()`

---

### CRITICAL-03: Webhook Expired/Failed TIDAK Atomic

**File:** `src/services/payment.service.ts` -> `handleXenditWebhook()` blok status EXPIRED

**Masalah:** 2 operasi UPDATE terpisah tanpa `$transaction`. Server crash = data tidak konsisten.

**Solusi:** Bungkus dalam `prisma.$transaction()`

---

## 2. BUGS TINGKAT TINGGI (HIGH)

### HIGH-01: CSV Export Rentan Formula Injection

**File:** `src/controllers/admin.controller.ts` -> `exportTransactionsCsv()`

**Masalah:** Data user langsung dimasukkan ke CSV tanpa sanitasi. Nama user `=CMD("calc")` bisa dieksekusi di Excel.

**Solusi:** Tambahkan sanitasi: jika field dimulai dengan `=+\-@`, prefix dengan single-quote.

---

### HIGH-02: Refresh Token Tidak Dihapus Setelah Dipakai (Token Replay Attack)

**File:** `src/services/token.service.ts` -> `verifyRefreshToken()`

**Masalah:** Token yang sama bisa dipakai berulang kali. Jika bocor, hacker bisa terus mendapatkan access token baru.

**Solusi:** Implementasi Token Rotation: hapus token lama, buat token baru setiap kali refresh.

---

### HIGH-03: Hardcoded Platform Revenue 5%

**File:** `src/services/admin.service.ts` -> `getFinanceStats()`

**Masalah:** `Number(released._sum.amount || 0) * 0.05` mengabaikan data PlatformFeeSetting. Dashboard selalu tampil 5% meski fee sudah diubah admin.

**Solusi:** Query fee dari tabel `PlatformFeeSetting` lalu hitung dinamis.

---

### HIGH-04: listDisputes Tanpa Pagination — Potensi OOM

**File:** `src/services/admin.service.ts` -> `listDisputes()`

**Masalah:** Query mengambil SELURUH data tanpa `take`/`skip`. 10.000 sengketa = server crash.

**Solusi:** Tambahkan parameter `page` dan `limit`.

---

## 3. BUGS TINGKAT MENENGAH (MEDIUM)

### MED-01: Auto-Expiry Negotiation di READ Request

**File:** `src/services/negotiation.service.ts` -> `listNegotiations()`

**Masalah:** Setiap GET menjalankan `updateMany` (side effect pada operasi baca).

**Solusi:** Pindahkan ke CRON JOB.

---

### MED-02: getDisputeDetail Tidak Throw Error Jika Null

**File:** `src/services/admin.service.ts` -> `getDisputeDetail()`

**Solusi:** Tambahkan `if (!order) throw new Error('Order tidak ditemukan');`

---

### MED-03: Xendit Secret Key Fallback String

**File:** `src/services/order.service.ts`

**Masalah:** `|| 'xnd_development_fake_key'` bisa menyebabkan error membingungkan di production.

**Solusi:** Validasi keberadaan env var saat startup, throw error jika tidak ada.

---

### MED-04: listOrdersByRole Tanpa Pagination

**File:** `src/services/order.service.ts` -> `listOrdersByRole()`

**Solusi:** Tambahkan parameter `page` dan `limit`.

---

### MED-05: updateUserStatus Tidak Mengecek User Ada

**File:** `src/services/admin.service.ts`

**Solusi:** Tambahkan `findUnique` sebelum `update`.

---

## 4. BUGS TINGKAT RENDAH (LOW) dan POTENSI

| ID     | Masalah                                      | File                | Solusi                                   |
| ------ | -------------------------------------------- | ------------------- | ---------------------------------------- |
| LOW-01 | OTP pakai Math.random (tidak kriptografis)   | token.service.ts    | Gunakan `crypto.randomInt()`             |
| LOW-02 | JWT Secret fallback 'changeme_secret'        | token.service.ts    | Gagalkan app saat startup jika tidak ada |
| LOW-03 | Search case-sensitive                        | admin.service.ts    | Pastikan collation DB case-insensitive   |
| LOW-04 | phone undefined di query OR registrasi       | auth.service.ts     | Hanya tambahkan phone jika ada nilainya  |
| LOW-05 | PayoutStatus dead import                     | admin.controller.ts | Hapus import yang tidak dipakai          |
| LOW-06 | Duplikat route categories.ts dan category.ts | src/routes/         | Konsolidasi menjadi satu file            |

---

## 5. Rekomendasi Best Practices

### Query Database

- Selalu tambahkan `take: limit` pada `findMany()`
- Gunakan `Prisma.XWhereInput` daripada `Record<string, unknown>`
- Buat interface untuk response Xendit daripada `as any`
- Raw SQL sudah pakai tagged template (BAGUS, pertahankan)

### Route

- Tambahkan Zod schema untuk SETIAP route POST/PATCH/PUT
- Tambahkan rate limit khusus untuk login, webhook, payout

### Service Logic

- Gunakan `throw new AppError()` konsisten (bukan `throw new Error()`)
- Pindahkan audit log KE DALAM `$transaction`
- Pindahkan side effect (auto-expiry) ke CRON JOB

### Validasi dan Types

- Selalu validasi via `validate(schema)` middleware
- Konsolidasi import UserRole ke satu sumber (`#prisma`)

---

## Hal yang Sudah BAGUS

1. Escrow Release dengan pessimistic locking (SELECT FOR UPDATE)
2. Payout Withdrawal dengan refund otomatis jika Xendit gagal
3. Admin Middleware melindungi seluruh sub-route admin
4. Zod Validation dengan nativeEnum tersinkronisasi Prisma
5. Dashboard Queries sudah dioptimasi dengan Raw SQL
6. Broadcast Chunking untuk mencegah MySQL packet overflow
7. Double-Payout Guard sudah ditambahkan di processPayout
8. CSV Date Range Limit sudah dibatasi 31 hari

---

**Prioritas Perbaikan:**

1. Perbaiki CRITICAL-01 (refund non-atomic) — 5 menit kerja
2. Perbaiki CRITICAL-02 dan 03 (webhook) — 10 menit kerja
3. Perbaiki HIGH-02 (token rotation) — 15 menit kerja
4. Sisanya bisa dikerjakan bertahap setelah deploy MVP
