# Planning Enkripsi dan Pembatasan Akses Data Pribadi

> Tanggal: 21 Juli 2026  
> Scope: Backend Express/Prisma, object storage, admin, dan mobile Flutter.

## Tujuan

- Data alamat, nomor telepon, identitas, rekening, dan snapshot pengiriman terenkripsi saat tersimpan.
- Data pribadi hanya dapat dibuka oleh pemilik, pihak transaksi yang memang membutuhkan, atau admin dengan alasan dan audit log.
- Endpoint publik tidak mengembalikan kontak, alamat lengkap, koordinat presisi, storage key, atau dokumen identitas.
- Migrasi dapat dilakukan bertahap tanpa downtime dan mendukung rotasi kunci.

Enkripsi database **bukan pengganti authorization**. Perlindungan wajib terdiri dari:

1. `requireAuth` pada route.
2. Pemeriksaan ownership/participant di service.
3. Field-level encryption AES-256-GCM saat tersimpan.
4. DTO/select publik yang hanya berisi field aman.
5. Audit log untuk akses admin dan pembukaan data sensitif.

## Klasifikasi dan kebijakan akses

| Kelas            | Contoh                                           | Akses                                                                         |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Publik           | nama toko, provinsi/kabupaten, status verifikasi | Semua pengguna                                                                |
| Privat pemilik   | alamat tersimpan, telepon profil, NPWP, rekening | Pemilik; admin terotorisasi                                                   |
| Privat transaksi | snapshot alamat order, kontak pickup/delivery    | Buyer, supplier order terkait, driver yang ditugaskan; admin                  |
| Sangat sensitif  | KTP, selfie, NIB/SIUP, tax ID, koordinat live    | Pemilik untuk status; dokumen hanya admin reviewer; pihak operasional minimum |
| Internal         | storage key, hash, encryption metadata           | Service backend saja                                                          |

## Temuan yang harus ditutup

### P0 — Authorization dan kebocoran publik

- `Backend/src/services/user.service.ts` memakai `isAuthorized` untuk membuka email/telepon kepada setiap pengguna login. Ganti dengan DTO publik; kontak hanya tersedia melalui flow transaksi yang sah.
- `getSupplierDetail` masih memilih `addressSelect` berisi alamat lengkap, telepon, latitude, dan longitude. Endpoint publik cukup mengirim provinsi/kabupaten.
- `getUserById` mengirim `verification.businessAddress` pada profil publik. Hapus dari public select.
- `Backend/src/services/bisa-express.service.ts` pada `trackByAwb`, `getTimeline`, dan `getLiveLocation` belum membuktikan requester adalah buyer/seller/driver/admin.
- KYC dan attachment chat tidak boleh menggunakan URL publik permanen. Gunakan signed proxy URL pendek setelah authorization.

### P1 — Data plaintext

- `Address.fullAddress` dan `Address.phoneNumber`.
- `UserVerification.taxId` dan `businessAddress`.
- `Order.shippingAddressSnapshot`.
- Kontak pickup/delivery pada `BisaExpressShipment`.
- `UserPayoutAccount.accountName`.
- Chat/support/dispute text yang dapat memuat kontak atau identitas.

## Desain teknis

### 1. Gunakan primitive enkripsi yang sudah ada

Pertahankan `Backend/src/utils/encryption.util.ts` sebagai primitive tunggal:

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

Field yang perlu pencarian exact/unique tidak boleh memakai random encryption. Gunakan blind index HMAC terpisah:

```prisma
phoneEncrypted String? @db.Text
phoneLookupHash String? @unique @db.VarChar(64)
```

`phoneLookupHash = HMAC-SHA256(normalizedPhone, lookupKey)`. Jangan memakai deterministic IV untuk banyak field baru jika blind index dapat memisahkan kerahasiaan dari pencarian.

### 2. Perubahan schema

Fase pertama tidak mengenkripsi `fullName`, provinsi, atau kabupaten karena dipakai pencarian/direktori.

Rencana field:

- `Address.fullAddress`: ubah/pertahankan `Text`, isi ciphertext.
- `Address.phoneNumber`: ciphertext; tambah `phoneLast4` bila UI membutuhkan masking tanpa decrypt.
- `UserVerification.taxId`, `businessAddress`: ciphertext.
- `Order.shippingAddressSnapshot`: simpan encrypted string pada kolom JSON dengan tolerant reader.
- `BisaExpressShipment.pickupAddress`, `pickupContact`, `pickupPhone`, `deliveryAddress`, `deliveryContact`, `deliveryPhone`, `podReceivedBy`: ciphertext.
- `UserPayoutAccount.accountName`: ciphertext; `accountNumber` mempertahankan implementasi terenkripsi saat ini.
- Tahap berikutnya: `ChatMessage.content`, `SupportMessage.content`, `SupportTicket.aiTranscript`, dan dispute evidence metadata.

Tambahkan migration hanya untuk perubahan tipe/index. Backfill ciphertext dilakukan oleh script terpisah agar migration SQL tidak membutuhkan kunci aplikasi.

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
- driver yang sedang ditugaskan;
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

- Pindahkan `kyc_verification_draft_v1` dari `SharedPreferences` ke `FlutterSecureStorage`.
- Simpan metadata minimum; hapus draft dan file KYC sementara setelah upload berhasil atau user membatalkan.
- Pending media upload session tidak boleh menyimpan metadata KYC plaintext.
- Hapus PDF invoice dari temporary directory setelah proses share selesai.
- Rekening pada list ditampilkan masked; endpoint/detail khusus owner mengembalikan nilai penuh untuk edit.
- Perubahan backend harus mempertahankan bentuk JSON API agar model Flutter tidak menerima ciphertext.

## Tahapan implementasi

### Fase 1 — Tutup kebocoran dan enforce ownership

- Buat public/private selects pada `user.service.ts`.
- Hapus email, telepon, alamat lengkap, business address, dan koordinat dari supplier/user public endpoints.
- Tambah participant guard pada seluruh endpoint BISA Express dan live location.
- Jadikan KYC/chat attachments private dengan signed proxy.
- Tambah rate limit pada tracking dan document endpoints.

### Fase 2 — Enkripsi alamat, KYC, dan order snapshot

- Tambah wrapper domain untuk encrypt/decrypt.
- Enkripsi semua write path sebelum Prisma.
- Tambah tolerant read: plaintext lama tetap terbaca selama backfill.
- Update order detail, checkout batch, invoice, shipping, dan admin dossier agar decrypt hanya setelah authorization.
- Pastikan log/error tidak mencetak plaintext.

### Fase 3 — Enkripsi logistik dan rekening

- Enkripsi kontak pickup/delivery dan POD recipient.
- Enkripsi `accountName`; pertahankan masking account number.
- Batasi driver pada shipment aktif yang ditugaskan.
- Hindari menyimpan plaintext PII dalam `trackingSnapshot` dan audit JSON.

### Fase 4 — Mobile hardening

- Secure-storage untuk KYC draft.
- Cleanup dokumen/image/PDF temporary.
- Screenshot protection pada KYC dan rekening bila diperlukan.
- Clear Cubit/form state sensitif saat logout.

### Fase 5 — Backfill dan rotasi kunci

- Perluas `scripts/migrate-encrypt-sensitive-data.ts` dengan batch/cursor, idempotensi `isEncryptedPayload`, dry-run, dan statistik tanpa menampilkan nilai.
- Backup database sebelum backfill.
- Deploy urutan: tolerant reader → encrypted writer → backfill → verification → hapus fallback plaintext.
- Rotasi memakai `ENCRYPTION_KEY_V2`: writer memakai versi baru, reader menerima v1/v2, lalu re-encrypt bertahap.
- Jangan menghapus kunci lama sebelum seluruh ciphertext versi lama terverifikasi nol.

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

- KYC draft tidak muncul di SharedPreferences.
- Draft/file temp terhapus setelah sukses dan logout.
- Invoice temp terhapus setelah share.
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
