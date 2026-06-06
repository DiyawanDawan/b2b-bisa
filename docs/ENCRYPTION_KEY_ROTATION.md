# ENCRYPTION_KEY Rotation Runbook

BISA memakai prefix versi pada ciphertext (`v1:`, `v2:`) untuk rotasi kunci AES-256-GCM.

## Langkah rotasi

1. Generate kunci baru:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Set `ENCRYPTION_KEY_V2` di environment (jangan hapus `ENCRYPTION_KEY` lama).
3. Deploy — `decryptField` otomatis memilih kunci berdasarkan prefix versi.
4. Jalankan script re-encrypt (salin `migrate-encrypt-sensitive-data.ts`, tulis ulang dengan `encryptField(..., '2')`).
5. Setelah semua row `v2:`, ganti `ENCRYPTION_KEY` lama dengan nilai `ENCRYPTION_KEY_V2`, hapus `ENCRYPTION_KEY_V2`.
6. Verifikasi withdraw, instruksi pembayaran, dan dossier admin.

## Dual-key window

Selama migrasi, kedua kunci harus tersedia agar data lama (`v1:`) dan baru (`v2:`) dapat dibaca.
