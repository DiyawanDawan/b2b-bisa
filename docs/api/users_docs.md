# User Management API Documentation (`/api/v1/users`)

Dokumentasi ini mencakup fitur pengelolaan profil publik, daftar alamat tambahan (CustomerAddress), dan manajemen jam operasional untuk Supplier.

## 1. Alamat Pelanggan (`CustomerAddress`)

Endpoint ini digunakan untuk mengelola daftar alamat pengiriman atau pengambilan barang.

### 1.1 List Addresses

**GET** `/api/v1/users/me/addresses`

- **Auth**: Required (`BUYER`, `SUPPLIER`)
- **QueryParams**:
  - `page`: (Opsional) Default 1
  - `limit`: (Opsional) Default 10
- **Response**:

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar alamat berhasil diambil"
  },
  "data": [
    {
      "id": "uuid",
      "label": "Gudang Utama",
      "fullAddress": "Jl. Raya Industri No. 45",
      "zipCode": "12345",
      "province": "Jawa Tengah",
      "regency": "Semarang",
      "latitude": -7.12345,
      "longitude": 110.12345
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### 1.2 Create Address

**POST** `/api/v1/users/me/addresses`

- **Auth**: Required
- **Body**:

```json
{
  "label": "Rumah",
  "countryId": "uuid",
  "provinceId": "uuid",
  "regencyId": "uuid",
  "districtId": "uuid",
  "villageId": "uuid",
  "fullAddress": "Alamat lengkap...",
  "zipCode": "12345",
  "latitude": -7.123,
  "longitude": 110.123
}
```

### 1.3 Update Address

**PUT** `/api/v1/users/me/addresses/:id`

- **Auth**: Required
- **Body**: Sama seperti Create (Parsial didukung)

### 1.4 Delete Address

**DELETE** `/api/v1/users/me/addresses/:id`

- **Auth**: Required

---

## 2. Jam Operasional (`OperatingHour`)

Khusus untuk profil Supplier guna menginformasikan waktu operasional usaha.

### 2.1 Get Operating Hours

**GET** `/api/v1/users/me/operating-hours`

- **Auth**: Required

### 2.2 Update Operating Hours

**PUT** `/api/v1/users/me/operating-hours`

- **Auth**: Required
- **Body**:

```json
[
  {
    "dayOfWeek": 1,
    "openTime": "08:00",
    "closeTime": "17:00",
    "isClosed": false
  },
  {
    "dayOfWeek": 0,
    "openTime": "00:00",
    "closeTime": "00:00",
    "isClosed": true
  }
]
```

> [!NOTE]
> `dayOfWeek` menggunakan index 0 (Minggu) sampai 6 (Sabtu).

---

## 3. Profil Publik

### 3.1 Get User Profile by ID

**GET** `/api/v1/users/:id`

- **Auth**: Public
- **Description**: Mengambil informasi profil publik user lain (Nama, Bio, Perusahaan, ESG Score).
