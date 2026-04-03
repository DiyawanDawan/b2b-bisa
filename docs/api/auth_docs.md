# 📘 Auth API Documentation

**BISA B2B Platform** | Base URL: `/api/v1/auth` | Version: `1.0.0`

> Semua response menggunakan envelope format:
>
> ```json
> { "meta": { "success": true, "status": 200, "message": "..." }, "data": {...} }
> ```

---

## 🔓 Public Endpoints

### `POST /register/supplier`

Mendaftarkan akun Supplier baru. Mengirim OTP ke email.

**Request Body:**

```json
{
  "fullName": "Budi Santoso",
  "email": "budi@supplier.com",
  "password": "Min8Karakter",
  "phone": "081234567890"
}
```

**Response `201`:**

```json
{
  "data": { "id": "uuid", "email": "budi@supplier.com", "role": "SUPPLIER" }
}
```

---

### `POST /register/buyer`

Mendaftarkan akun Buyer baru. `phone` wajib diisi.

**Request Body:**

```json
{
  "fullName": "PT Maju Jaya",
  "email": "procurement@majujaya.com",
  "password": "Min8Karakter",
  "phone": "081234567890"
}
```

**Response `201`:** _(sama dengan register supplier, role: "BUYER")_

---

### `POST /verify-registration`

Verifikasi OTP yang dikirim ke email saat registrasi.

**Request Body:**

```json
{ "email": "budi@supplier.com", "code": "123456" }
```

**Response `200`:**

```json
{ "data": { "message": "Email berhasil diverifikasi." } }
```

---

### `POST /login`

Login dengan email dan password. Rate limited: **5 req/menit per IP**.

**Request Body:**

```json
{ "email": "budi@supplier.com", "password": "Min8Karakter" }
```

**Response `200`:**

```json
{
  "data": {
    "token": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "a1b2c3d4..."
    },
    "user": {
      "id": "uuid",
      "fullName": "Budi Santoso",
      "email": "budi@supplier.com",
      "role": "SUPPLIER",
      "avatarUrl": null,
      "province": "Jawa Tengah"
    }
  }
}
```

**Error `403`:** Email belum diverifikasi  
**Error `403`:** Akun dinonaktifkan

---

### `POST /refresh-token`

Mendapatkan access token baru menggunakan refresh token.

**Request Body:**

```json
{ "token": "a1b2c3d4..." }
```

**Response `200`:**

```json
{ "data": { "accessToken": "eyJhbGci..." } }
```

---

### `POST /forgot-password`

Mengirim kode OTP reset password ke email. Rate limited: **5 req/menit per IP**.

> ⚠️ Response selalu `200` meski email tidak terdaftar (security: tidak bocorkan eksistensi email)

**Request Body:**

```json
{ "email": "budi@supplier.com" }
```

**Response `200`:** `{ "data": null }`

---

### `POST /verify-reset-code`

Memverifikasi kode OTP reset password. Mengembalikan `resetToken` sekali pakai (expire: 30 menit).

**Request Body:**

```json
{ "email": "budi@supplier.com", "code": "654321" }
```

**Response `200`:**

```json
{ "data": { "resetToken": "hex64chars..." } }
```

---

### `POST /reset-password/:token`

Reset password menggunakan `resetToken` dari endpoint sebelumnya. Token **one-time use**.

**URL Param:** `:token` — nilai dari `resetToken`

**Request Body:**

```json
{ "password": "PasswordBaruMin8" }
```

**Response `200`:** `{ "data": null }`  
**Error `400`:** Token tidak valid atau sudah kedaluwarsa

---

### `POST /resend-otp`

Kirim ulang kode OTP. Rate limited: **5 req/menit per IP**.

**Request Body:**

```json
{
  "email": "budi@supplier.com",
  "type": "REGISTRATION"
}
```

> `type`: `"REGISTRATION"` | `"PASSWORD_RESET"`

**Response `200`:** `{ "data": null }`

---

## 🔒 Authenticated Endpoints

> Wajib mengirim header: `Authorization: Bearer {accessToken}`

---

### `POST /logout`

Logout dan invalidasi refresh token di database (semua device jika `refreshToken` tidak dikirim).

**Request Body (opsional):**

```json
{ "refreshToken": "a1b2c3d4..." }
```

**Response `200`:** `{ "data": null }`

---

### `POST /reset-password`

Ganti password saat sudah login (tanpa memerlukan token reset).

**Request Body:**

```json
{ "password": "PasswordBaruMin8" }
```

**Response `200`:** `{ "data": null }`

---

### `GET /me`

Mengambil profil lengkap user yang sedang login. **Query ringan — hanya field yang dibutuhkan UI.**

**Response `200`:**

```json
{
  "data": {
    "id": "uuid",
    "fullName": "Budi Santoso",
    "email": "budi@supplier.com",
    "role": "SUPPLIER",
    "tier": "FREE",
    "phone": "081234567890",
    "avatarUrl": "https://r2.bisa.id/avatars/uuid_123.jpg",
    "province": "Jawa Tengah",
    "regency": "Semarang",
    "isEmailVerified": true,
    "isPhoneVerified": false,
    "isActive": true,
    "profile": {
      "bio": "Supplier biochar terpercaya",
      "website": "https://budi.com",
      "companyName": "CV Budi Makmur",
      "npwp": "12.345.678.9-000.000",
      "businessType": "Pengepul"
    },
    "verification": {
      "verificationStatus": "PENDING",
      "isVerified": false
    },
    "createdAt": "2025-01-15T08:00:00.000Z"
  }
}
```

---

### `PATCH /me`

Update profil user. Mendukung upload file avatar (`multipart/form-data`).

**Content-Type:** `multipart/form-data`

| Field          | Type     | Keterangan             |
| -------------- | -------- | ---------------------- |
| `avatar`       | `file`   | Foto profil (opsional) |
| `fullName`     | `string` | Nama lengkap           |
| `phone`        | `string` | Nomor telepon          |
| `province`     | `string` | Nama provinsi          |
| `regency`      | `string` | Nama kabupaten         |
| `bio`          | `string` | Deskripsi singkat      |
| `companyName`  | `string` | Nama perusahaan        |
| `npwp`         | `string` | Nomor NPWP             |
| `businessType` | `string` | Jenis usaha            |

**Response `200`:** _(Profile data tanpa password)_

---

### `POST /me/phone/request-update`

Request OTP untuk verifikasi nomor telepon baru.

**Request Body:**

```json
{ "phone": "082198765432" }
```

**Response `200`:** `{ "data": null }`

---

### `POST /me/phone/verify-update`

Verifikasi OTP dan simpan nomor telepon baru.

**Request Body:**

```json
{ "code": "123456", "phone": "082198765432" }
```

**Response `200`:** _(Data user terupdate)_

---

### `POST /me/verify`

Upload dokumen identitas untuk verifikasi KYC. **Content-Type: `multipart/form-data`**

| Field             | Type     | Keterangan                          |
| ----------------- | -------- | ----------------------------------- |
| `ktp`             | `file`   | Kartu Tanda Penduduk (KTP)          |
| `nib`             | `file`   | Nomor Induk Berusaha (NIB)          |
| `selfie`          | `file`   | Foto selfie dengan KTP              |
| `siup`            | `file`   | Surat Izin Usaha Perdagangan (SIUP) |
| `businessName`    | `string` | Nama bisnis (opsional)              |
| `taxId`           | `string` | NPWP bisnis (opsional)              |
| `businessAddress` | `string` | Alamat bisnis (opsional)            |

> Minimal **satu** dokumen wajib dikirim.

**Response `200`:**

```json
{
  "data": {
    "verificationStatus": "PENDING",
    "message": "Dokumen identitas berhasil dikirim untuk verifikasi"
  }
}
```

---

## 🌐 Social Auth (Coming Soon)

```
POST /google   → 501 Not Implemented
POST /facebook → 501 Not Implemented
```

---

## ⚠️ Error Responses

| Status | Keterangan                              |
| ------ | --------------------------------------- |
| `400`  | Validasi gagal / data tidak valid       |
| `401`  | Token tidak valid / belum login         |
| `403`  | Akun non-aktif / email belum verifikasi |
| `404`  | Resource tidak ditemukan                |
| `409`  | Email sudah terdaftar                   |
| `429`  | Rate limit terlampaui                   |
| `500`  | Internal server error                   |

---

_Last updated: 2026-03-31 — Audit & Hardening oleh Antigravity AI_
