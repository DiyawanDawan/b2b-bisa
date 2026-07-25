# Planning Enkripsi dan Pembatasan Akses Data Pribadi

> Tanggal: 21 Juli 2026 (direvisi 25 Juli 2026)  
> Scope: Backend Express/Prisma (`b2b-bisa/src`), object storage, admin, dan mobile Flutter.

## Tujuan

- Data alamat, nomor telepon, identitas, rekening, dan snapshot pengiriman terenkripsi saat tersimpan.
- Data pribadi hanya dapat dibuka oleh pemilik, pihak transaksi yang memang membutuhkan, atau admin dengan alasan dan audit log.
- Endpoint publik tidak mengembalikan kontak, alamat lengkap, koordinat presisi, storage key, atau dokumen identitas.
- Migrasi dapat dilakukan bertahap tanpa downtime dan mendukung rotasi kunci.

Enkripsi database **bukan pengganti authorization**. Perlindungan wajib terdiri dari:

1. `requireAuth` pada route.
2. Pemeriksaan ownership/participant di service.
3. Field-level encryption **AES-256-GCM** saat tersimpan (`src/utils/encryption.util.ts`).
4. DTO/select publik yang hanya berisi field aman.
5. Audit log untuk akses admin dan pembukaan data sensitif.

### Catatan algoritma (jangan tertukar)

| Nama                              | Kegunaan di BISA                                                       | Bukan untuk       |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| **AES-256-GCM**                   | Enkripsi field at-rest (NPWP, rekening, snapshot, alamat, dll.)        | Signing token     |
| **ES256** (ECDSA P-256 + SHA-256) | Hanya jika dipakai untuk **JWT signing** (bukan enkripsi data pribadi) | Enkripsi field DB |

Payload ciphertext memakai format versioned: `v{n}:{iv_b64url}:{tag_b64url}:{ciphertext_b64url}`.

## Klasifikasi dan kebijakan akses

| Kelas            | Contoh                                           | Akses                                                                         |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Publik           | nama toko, provinsi/kabupaten, status verifikasi | Semua pengguna                                                                |
| Privat pemilik   | alamat tersimpan, telepon profil, NPWP, rekening | Pemilik; admin terotorisasi                                                   |
| Privat transaksi | snapshot alamat order, kontak pickup/delivery    | Buyer, supplier order terkait, driver yang ditugaskan; admin                  |
| Sangat sensitif  | KTP, selfie, NIB/SIUP, tax ID, koordinat live    | Pemilik untuk status; dokumen hanya admin reviewer; pihak operasional minimum |
| Internal         | storage key, hash, encryption metadata           | Service backend saja                                                          |

## Sudah terenkripsi (baseline)

Field berikut **sudah** memakai AES-256-GCM lewat `encryption.util.ts` / `payoutAccount.util.ts` / `piiField.util.ts`, dengan backfill di `scripts/migrate-encrypt-sensitive-data.ts`:

| Field                                                                                                                                       | Catatan                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `UserProfile.npwp`                                                                                                                          | Random IV (`encryptField`); reader masking di `auth.service` / admin                                        |
| `UserPayoutAccount.accountNumber`                                                                                                           | Deterministic IV per `(userId, bankId)` agar unique index tetap valid                                       |
| `UserPayoutAccount.accountName`                                                                                                             | Random IV via `sealAccountName` / `revealAccountName`                                                       |
| `Transaction.providerActions`                                                                                                               | JSON di-seal sebagai string encrypted (`sealProviderActions`)                                               |
| `PlatformBankAccount.accountNumber`                                                                                                         | Random IV (`encryptField`)                                                                                  |
| `Address.fullAddress`, `Address.phoneNumber`                                                                                                | Random IV via `piiField.util` (`sealAddress` / `sealAddressPhone`); lat/lng tetap plaintext + redact publik |
| `UserVerification.taxId`, `businessAddress`                                                                                                 | Random IV via `sealTaxId` / `sealBusinessAddress`                                                           |
| `Order.shippingAddressSnapshot`                                                                                                             | JSON object → ciphertext string (`sealShippingAddressSnapshot` / `decryptJsonValue`)                        |
| `BisaExpressShipment.pickupAddress`, `pickupContact`, `pickupPhone`, `deliveryAddress`, `deliveryContact`, `deliveryPhone`, `podReceivedBy` | Random IV via `sealShipment*` / `revealShipmentFields`                                                      |

Seed menulis ciphertext via helpers yang sama dengan runtime; migrate script / tolerant reader (`isEncryptedPayload` → decrypt) menutup baris legacy. Lihat bagian [Seed data](#seed-data-dan-npm-run-seed).

## Temuan yang harus ditutup

### P0 — Authorization dan kebocoran publik ✅ (Fase 1)

- ~~`src/services/user.service.ts` memakai `isAuthorized` untuk membuka email/telepon kepada setiap pengguna login.~~ ✅ Public DTO; kontak hanya lewat flow transaksi / owner.
- ~~`getSupplierDetail` masih memilih `addressSelect` berisi alamat lengkap, telepon, latitude, dan longitude.~~ ✅ Provinsi/kabupaten saja; tanpa nested Address PII / koordinat.
- ~~`getUserById` mengirim `verification.businessAddress` pada profil publik.~~ ✅ Public select hanya `isVerified` / `businessName`.
- ~~`trackByAwb` / `getTimeline` / `getLiveLocation` belum membuktikan participant.~~ ✅ `assertShipmentParticipant` (buyer/seller/assigned driver/admin) → 403.
- ~~KYC / attachment chat URL publik permanen; `negotiations/` di `PUBLIC_ASSET_PREFIXES`.~~ ✅ Prefix privat; signed proxy (`negotiationMedia.util`, admin KYC queue/dossier).

### P1 — Data plaintext (Fase 4+)

- ~~`Address.fullAddress` dan `Address.phoneNumber`.~~ ✅ Fase 2
- ~~`UserVerification.taxId` dan `businessAddress`.~~ ✅ Fase 2
- ~~`Order.shippingAddressSnapshot`.~~ ✅ Fase 2
- ~~Kontak pickup/delivery pada `BisaExpressShipment`.~~ ✅ Fase 3
- ~~`UserPayoutAccount.accountName`.~~ ✅ Fase 3
- Chat/support/dispute text yang dapat memuat kontak atau identitas.

## Desain teknis

### 1. Gunakan primitive enkripsi yang sudah ada

Pertahankan `src/utils/encryption.util.ts` sebagai primitive tunggal:

```ts
const sealed = encryptField(plaintext); // random IV, field biasa
const value = decryptField(sealed);

const sealedJson = encryptJsonValue(snapshot);
const snapshot = decryptJsonValue(sealedJson);
```

Tambahkan wrapper per domain agar context dan fallback migration konsisten:

```ts
export const sealAddress = (value: string | null) => (value ? encryptField(value) : value);

export const revealAddress = (value: string | null) => (value ? decryptField(value) : value);
```

### Scope telepon

| Field                                             | Kebijakan                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Address.phoneNumber`                             | Enkripsi at-rest (Fase 2). Bukan unique; boleh random IV. Opsional `phoneLast4` untuk masking UI tanpa decrypt.                                                                                                                                             |
| `User.phone`                                      | Tetap dipakai login/OTP dan **`@unique`**. Jangan ganti ke random ciphertext di kolom yang sama tanpa blind index. Jika harus dienkripsi: kolom `phoneEncrypted` + `phoneLookupHash` (HMAC), atau biarkan plaintext sampai Fase terpisah dengan LOOKUP_KEY. |
| Kontak shipment (`pickupPhone` / `deliveryPhone`) | Enkripsi seperti alamat (Fase 3); bukan lookup unique.                                                                                                                                                                                                      |

Field yang perlu pencarian exact/unique tidak boleh memakai random encryption. Gunakan blind index HMAC terpisah:

```prisma
phoneEncrypted String? @db.Text
phoneLookupHash String? @unique @db.VarChar(64)
```

`phoneLookupHash = HMAC-SHA256(normalizedPhone, LOOKUP_KEY)`. Jangan memakai deterministic IV untuk banyak field baru jika blind index dapat memisahkan kerahasiaan dari pencarian.

### 2. Perubahan schema

Fase pertama tidak mengenkripsi `fullName`, provinsi, atau kabupaten karena dipakai pencarian/direktori.

Rencana field:

- `Address.fullAddress`: ubah/pertahankan `Text`, isi ciphertext.
- `Address.phoneNumber`: ciphertext; tambah `phoneLast4` bila UI membutuhkan masking tanpa decrypt.
- `UserVerification.taxId`, `businessAddress`: ciphertext.
- `Order.shippingAddressSnapshot`: lihat konvensi di bawah.
- `BisaExpressShipment.pickupAddress`, `pickupContact`, `pickupPhone`, `deliveryAddress`, `deliveryContact`, `deliveryPhone`, `podReceivedBy`: ciphertext.
- `UserPayoutAccount.accountName`: ciphertext; `accountNumber` mempertahankan implementasi terenkripsi saat ini.
- Tahap berikutnya: `ChatMessage.content`, `SupportMessage.content`, `SupportTicket.aiTranscript`, dan dispute evidence metadata.

Tambahkan migration hanya untuk perubahan tipe/index. Backfill ciphertext dilakukan oleh script terpisah agar migration SQL tidak membutuhkan kunci aplikasi.

#### Konvensi `shippingAddressSnapshot` (JSON)

Kolom Prisma tetap bertipe `Json`. Setelah enkripsi:

1. **Writer** menyimpan **satu string** ciphertext sebagai nilai JSON (`"v1:iv:tag:..."`), bukan object plaintext. Gunakan `encryptJsonValue(snapshot)` / cast `Prisma.InputJsonValue` seperti `sealProviderActions`.
2. **Reader toleran** (`decryptJsonValue`):
   - string + `isEncryptedPayload` → decrypt → `JSON.parse` → object;
   - object JSON lama (plaintext) → kembalikan apa adanya selama masa migrasi;
   - string JSON non-encrypted → parse bila valid.
3. Jangan double-encrypt: cek `isEncryptedPayload` sebelum seal.
4. Setelah backfill selesai dan verifikasi, hapus fallback plaintext di reader.

#### Latitude / longitude (Phase 1)

- **Phase 1:** redact `latitude` / `longitude` dari DTO publik (supplier detail, profil publik). Jangan kirim koordinat presisi ke viewer yang tidak berhak.
- **Enkripsi koordinat alamat** hanya jika dibutuhkan di Fase 2+; preferensi saat ini: **redact dulu**, enkripsi belakangan kecuali write-path sudah mengenkripsi.
- Live location driver tetap tersedia hanya setelah participant guard (buyer/seller/assigned driver/admin).

### 3. Ownership guard terpusat

Tambahkan helper yang menghasilkan `403`, bukan `404` yang membocorkan detail berbeda:

```ts
export const assertOwnerOrAdmin = (requester: { id: string; role: UserRole }, ownerId: string) => {
  if (requester.id !== ownerId && requester.role !== UserRole.ADMIN) {
    throw new AppError('Akses ditolak.', 403);
  }
};
```

Untuk transaksi gunakan `assertOrderParticipant`, dan untuk pengiriman gunakan:

- buyer order terkait;
- supplier order terkait;
- driver yang sedang ditugaskan (`BisaExpressDriver.userId`);
- admin.

Jangan menerima `userId` pemilik dari body/query. Selalu gunakan `req.user.id` dan relasi database.

### 4. Pisahkan DTO publik dan privat

Hindari conditional Prisma select berdasarkan sekadar “sudah login”.

```ts
const publicSupplierSelect = {
  id: true,
  fullName: true,
  province: true,
  regency: true,
  profile: { select: { companyName: true, bio: true } },
  verification: { select: { isVerified: true } },
} satisfies Prisma.UserSelect;
```

DTO privat pemilik boleh mengembalikan plaintext setelah decrypt. DTO transaksi hanya mengembalikan field minimum untuk fulfillment. Storage key, IV/tag, reviewer internal, dan ciphertext tidak pernah dikirim.

### 5. Dokumen dan attachment privat

- KTP/selfie/NIB/SIUP tetap pada prefix privat `verification/{userId}`.
- Hapus `negotiations/` dari `PUBLIC_ASSET_PREFIXES`.
- Endpoint dokumen memvalidasi owner/participant/admin sebelum menghasilkan signed proxy URL 5–15 menit.
- Jangan simpan signed URL di database.
- Catat akses admin ke dossier/dokumen dalam `AuditLog` tanpa menyalin isi PII ke `oldValue/newValue`.

### 6. Mobile

- ~~Pindahkan `kyc_verification_draft_v1` dari `SharedPreferences` ke `FlutterSecureStorage`.~~ ✅
- ~~Simpan metadata minimum; hapus draft dan file KYC sementara setelah upload berhasil atau user membatalkan / logout.~~ ✅
- ~~Pending media upload session tidak boleh menyimpan metadata KYC plaintext.~~ ✅
- ~~Hapus PDF invoice dari temporary directory setelah proses share selesai.~~ ✅
- Rekening pada list ditampilkan masked; endpoint/detail khusus owner mengembalikan nilai penuh untuk edit.
- Perubahan backend harus mempertahankan bentuk JSON API agar model Flutter tidak menerima ciphertext.

## Seed data dan `npm run seed`

Enkripsi **akan mempengaruhi seed** untuk setiap field yang di-seal di write-path aplikasi.

### File seed yang menulis field sensitif / akan terenkripsi

| Seed file                                        | Field ditulis                                                                                                                                         | Status enkripsi app                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `prisma/seed/04-users.seeder.js`                 | `UserProfile.npwp`, `Address.fullAddress`, `Address.phoneNumber`, `UserPayoutAccount.accountNumber` + `accountName`, `User.phone`, customer addresses | **NPWP, accountNumber, accountName, fullAddress, phoneNumber di-seal di seed**    |
| `prisma/seed/03-financial.seeder.js`             | `PlatformBankAccount.accountNumber` (+ nama)                                                                                                          | **accountNumber di-seal di seed**                                                 |
| `prisma/seed/01-taxonomies.seeder.js`            | `Address.fullAddress` (sample)                                                                                                                        | **fullAddress di-seal di seed**                                                   |
| `prisma/seed/12-verifications.seeder.js`         | `businessAddress`, URL KTP/selfie sample                                                                                                              | **businessAddress di-seal di seed**                                               |
| `prisma/seed/15-orders-negotiations.seeder.js`   | `shippingAddressSnapshot`                                                                                                                             | **snapshot di-seal via `sealShippingAddressSnapshot`**                            |
| `prisma/seed/21-regional-market-sales.seeder.js` | `Address.fullAddress`, `shippingAddressSnapshot`                                                                                                      | **fullAddress + snapshot di-seal di seed**                                        |
| `prisma/seed/24-bisa-express.seeder.js`          | hub `fullAddress`, `phoneNumber`                                                                                                                      | **hub Address di-seal di seed** (lookup via hub code, bukan `contains` plaintext) |
| `prisma/seed/24b-bisa-express-demo.seeder.js`    | address PII, pickup/delivery contact fields                                                                                                           | **hub Address + shipment contact di-seal di seed**                                |

`User.phone` di seed: tetap plaintext selama kolom unique belum diganti blind-index (lihat scope telepon).

### Apakah seed harus memanggil encrypt helpers?

**Ya, setelah write-path produksi mengenkripsi field tersebut** — agar DB hasil `npm run seed` konsisten dengan runtime (unique deterministic account number, ciphertext NPWP, dll.).

Pendekatan yang direkomendasikan:

1. **Tolerant readers tetap ada** selama migrasi (`isEncryptedPayload` / `decryptJsonValue`).
2. **Seed memanggil seal helpers** yang sama dengan app (import dari `src/utils/...`), bukan menduplikasi crypto di seeder.
3. Untuk field deterministic (`accountNumber`): seed **wajib** `sealAccountNumber(plain, { userId, bankId })` agar upsert/unique tidak bentrok dengan data runtime.
4. Opsional post-seed: tetap jalankan `npx tsx scripts/migrate-encrypt-sensitive-data.ts` untuk mengamankan baris legacy/plaintext yang terlewat (idempotent).
5. Jangan mengandalkan “seed plaintext saja” setelah writer production menolak/mengasumsikan ciphertext untuk unique lookup.

Urutan aman: deploy tolerant reader → encrypt writers → update seed seal helpers → backfill migrate → verifikasi → hapus fallback plaintext.

## Tahapan implementasi

### Fase 1 — Tutup kebocoran dan enforce ownership ✅

- ~~Buat public/private selects pada `user.service.ts`.~~ ✅
- ~~Hapus email, telepon, alamat lengkap, business address, dan koordinat dari supplier/user public endpoints.~~ ✅
- ~~Tambah participant guard pada seluruh endpoint BISA Express track/timeline/live location.~~ ✅
- ~~Jadikan KYC/chat attachments private dengan signed proxy.~~ ✅
- Rate limit tracking sudah lewat `publicApiLimiter` pada mount `/api/v1/bisa-express`.

### Fase 2 — Enkripsi alamat, KYC, dan order snapshot ✅

- Tambah wrapper domain untuk encrypt/decrypt (`src/utils/piiField.util.ts`).
- Enkripsi semua write path sebelum Prisma.
- Tambah tolerant read: plaintext lama tetap terbaca selama backfill.
- Update order detail, checkout batch, invoice, shipping, dan admin dossier agar decrypt hanya setelah authorization.
- Pastikan log/error tidak mencetak plaintext.
- Update seeders terkait agar menulis ciphertext via helpers.
- Perluas `migrate-encrypt-sensitive-data.ts` untuk address / verification / shipping snapshot.

### Fase 3 — Enkripsi logistik dan rekening ✅

- Enkripsi kontak pickup/delivery dan POD recipient.
- Enkripsi `accountName`; pertahankan masking account number.
- Batasi driver pada shipment aktif yang ditugaskan.
- Hindari menyimpan plaintext PII dalam `trackingSnapshot` dan audit JSON.

### Fase 4 — Mobile hardening ✅

- Secure-storage untuk KYC draft (`FlutterSecureStorage`, migrasi sekali dari SharedPreferences `kyc_verification_draft_v1`).
- Cleanup dokumen/image/PDF temporary (KYC local files setelah submit/logout; invoice/partnership PDF setelah share).
- Screenshot protection (Android `FLAG_SECURE`) pada KYC dan wallet/rekening.
- Clear Cubit/form state sensitif saat logout (`SessionManager` + `KycDraftStore.clear`).
- Pending media upload session tidak menyimpan folder `verification` ke SharedPreferences.

### Fase 5 — Backfill dan rotasi kunci ✅

- Perluas `scripts/migrate-encrypt-sensitive-data.ts` dengan batch/cursor, idempotensi `isEncryptedPayload`, dry-run, dan statistik tanpa menampilkan nilai.
- Backup database sebelum backfill.
- Deploy urutan: tolerant reader → encrypted writer → backfill → verification → hapus fallback plaintext.
- Rotasi memakai `ENCRYPTION_KEY_V2`: writer memakai versi baru, reader menerima v1/v2, lalu re-encrypt bertahap (`scripts/rotate-encryption-keys.ts`).
- Jangan menghapus kunci lama sebelum seluruh ciphertext versi lama terverifikasi nol.
- Verifikasi residual: `scripts/verify-encryption.ts --db` (counts per table.field; nilai tidak dicetak).

Lihat [Runbook operasional](#runbook-operasional-fase-5) di bawah.

## Runbook operasional (Fase 5)

Urutan aman di production. **Jangan** menghapus tolerant plaintext readers sampai residual plaintext = 0 dan aplikasi sudah stabil.

### Prasyarat

- `ENCRYPTION_KEY` di secret manager (32-byte hex atau base64).
- Backup database terenkripsi + uji restore spot-check.
- Tolerant readers + encrypted writers sudah ter-deploy (Fase 2–3).

### A. Backfill plaintext → ciphertext

```bash
# 1) Backup DB (contoh mysqldump / snapshot managed DB) — WAJIB

# 2) Dry-run (tidak menulis)
npm run migrate:encrypt:dry
# atau: npx tsx scripts/migrate-encrypt-sensitive-data.ts --dry-run --batch-size=200

# 3) Write backfill (idempotent; aman diulang)
npm run migrate:encrypt
# Resume setelah id tertentu (per tabel, orderBy id asc):
# npx tsx scripts/migrate-encrypt-sensitive-data.ts --from-id=<cuid> --only=addresses

# 4) Verifikasi residual plaintext (exit 1 jika masih ada plaintext)
npm run verify:encryption:db
# atau: npx tsx scripts/verify-encryption.ts --db
```

Flags migrate: `--dry-run`, `--batch-size=N`, `--from-id=ID`, `--only=payoutAccounts,addresses,...`

### B. (Nanti) Hapus tolerant plaintext fallbacks

Hanya setelah langkah A hijau di production dan monitoring tenang:

1. Hapus cabang “return plaintext as-is” di `decryptField` / `reveal*` / `decryptJsonValue` (atau buat ketat: throw jika bukan ciphertext).
2. Deploy; pastikan tidak ada row legacy tersisa.
3. **Belum dilakukan di Fase 5 ini** — tetap dokumentasikan sebagai post-backfill step.

### C. Rotasi kunci (ENCRYPTION_KEY → ENCRYPTION_KEY_V2)

```bash
# 1) Generate kunci baru; set ENCRYPTION_KEY_V2 di secret manager.
#    Biarkan ENCRYPTION_KEY (v1) tetap ada untuk decrypt.

# 2) Deploy app: writer otomatis memakai v2 (getActiveEncryptionVersion),
#    reader tetap menerima v1 dan v2 dari prefix payload.

# 3) Dry-run rotasi batch v1 → v2
npm run rotate:encryption:dry
# npx tsx scripts/rotate-encryption-keys.ts --dry-run --from-version=1 --to-version=2

# 4) Write rotasi
npm run rotate:encryption

# 5) Verifikasi semua ciphertext di v2
npx tsx scripts/verify-encryption.ts --db --expect-version=2

# 6) Setelah residual v1 = 0 dan masa tenang: hapus ENCRYPTION_KEY dari runtime
#    (simpan offline di vault untuk disaster recovery). Jangan hapus terlalu cepat.
```

### D. Perintah verifikasi cepat

| Perintah                                                  | Fungsi                                      |
| --------------------------------------------------------- | ------------------------------------------- |
| `npm run test:encryption`                                 | Unit crypto + PII helpers (tanpa DB)        |
| `npm run verify:encryption:db`                            | Counts residual plaintext + versi per field |
| `npm run test:unit -- tests/unit/encryption.util.test.ts` | Jest unit (butuh deps/Prisma generate)      |

### Status fase

| Fase                                  | Status |
| ------------------------------------- | ------ |
| 1 — Tutup kebocoran / ownership       | ✅     |
| 2 — Enkripsi alamat / KYC / snapshot  | ✅     |
| 3 — Enkripsi logistik / rekening      | ✅     |
| 4 — Mobile hardening                  | ✅     |
| 5 — Backfill + rotasi kunci + runbook | ✅     |

**Residual (bukan blocker Fase 1–5):** chat/support/dispute text masih plaintext (P1 deferred); `User.phone` tetap plaintext (unique/login); tolerant plaintext readers sengaja dipertahankan sampai backfill production hijau; `verification.service.getPendingVerifications` mengembalikan storage key mentah tetapi route admin aktif memakai `admin.service` queue/dossier yang sudah signed.

## Verifikasi

### Backend unit/integration

- User A tidak dapat membaca/update/delete alamat User B.
- Login biasa tidak dapat mengambil email/telepon/alamat supplier.
- Buyer/supplier di luar order tidak dapat membuka snapshot alamat.
- AWB/shipment ID milik pihak lain menghasilkan `403`.
- Driver hanya dapat membuka shipment yang ditugaskan.
- Admin dapat membuka dossier melalui endpoint audit; URL kedaluwarsa dan tidak publik.
- Ciphertext tersimpan di database, sedangkan API owner mengembalikan plaintext.
- Backfill aman dijalankan dua kali dan tidak double-encrypt.
- Salah kunci/version gagal tertutup tanpa membocorkan ciphertext atau stack.
- Audit log tidak menyimpan PII plaintext.

### Mobile

- ~~KYC draft tidak muncul di SharedPreferences.~~ ✅ Fase 4 (`FlutterSecureStorage` + migrasi legacy)
- ~~Draft/file temp terhapus setelah sukses dan logout.~~ ✅ Fase 4
- ~~Invoice temp terhapus setelah share.~~ ✅ Fase 4
- Alamat/rekening tidak tercache ke disk.
- Deep link langsung ke wallet/KYC tetap membutuhkan autentikasi.

### Pemeriksaan operasional

- `ENCRYPTION_KEY`/`ENCRYPTION_KEY_V2` hanya dari secret manager, bukan git atau mobile binary.
- Backup terenkripsi dan akses database dibatasi.
- Log production menerapkan redaction untuk telepon, alamat, NPWP, rekening, dan signed URL.
- Jalankan Prisma validate/generate, Backend lint/tests, Admin tests, dan Flutter analyze/tests.

## Kriteria selesai

- Tidak ada endpoint publik yang mengembalikan alamat lengkap, kontak, koordinat presisi, atau URL dokumen privat.
- Setiap resource dengan `:id` memiliki bukti owner/participant/admin sebelum decrypt.
- Field P0/P1 tersimpan sebagai payload versioned AES-256-GCM.
- Tidak ada PII sensitif dalam SharedPreferences, log, audit JSON, atau file temp yang tertinggal.
- Backfill dan key rotation terdokumentasi, idempotent, dan teruji.
