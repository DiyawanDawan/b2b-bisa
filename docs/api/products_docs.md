# Product API Documentation

Endpoints untuk mengelola katalog produk biomassa dan biochar di marketplace BISA B2B.

## 1. List Products

**GET** `/api/v1/products`

- **Auth**: Public
- **QueryParams**:
  - `page`: (Opsional) Default 1
  - `limit`: (Opsional) Default 10
  - `categoryId`: (Opsional) Filter berdasarkan UUID Kategori
  - `biomassaType`: (Opsional) `SEKAM_PADI`, `TONGKOL_JAGUNG`, `TEMPURUNG_KELAPA`, `BIOCHAR`
  - `grade`: (Opsional) `A`, `B`, `C` (Hanya untuk Biochar)
  - `province`: (Opsional) Filter lokasi (GIS)
  - `minPrice` / `maxPrice`: (Opsional) Range harga per unit
- **Response**:

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar produk berhasil diambil",
    "pagination": {
      "total": 50,
      "page": 1,
      "limit": 10,
      "totalPages": 5
    }
  },
  "data": [
    {
      "id": "uuid-produk",
      "name": "Biochar Sekam Padi",
      "pricePerUnit": 15000.0,
      "unit": "KG",
      "stock": 500.0,
      "thumbnailUrl": "url-gambar",
      "category": { "name": "Produk Biochar" }
    }
  ]
}
```

## 2. Get Product Detail

**GET** `/api/v1/products/:id`

- **Auth**: Public
- **Description**: Mengambil detail lengkap produk termasuk spesifikasi teknis (Technical Specs).

## 3. Create Product (Supplier Only)

**POST** `/api/v1/products`

- **Auth**: Required (`SUPPLIER`, `ADMIN`)
- **Body**: `multipart/form-data`
  - `images`: Array of files (Max 5)
  - `name`: string
  - `categoryId`: string (UUID)
  - `biomassaType`: Enum
  - `pricePerUnit`: number
  - `stock`: number
  - `unit`: `KG` | `TON`
  - `moistureContent`: number (opsional)
  - `carbonPurity`: number (opsional)

## 4. Update Product (Supplier/Admin)

**PATCH** `/api/v1/products/:id`

- **Auth**: Required
- **Body**: Sama seperti create (Partial update supported). Jika data `images` dikirim, maka galeri lama akan diganti dengan yang baru.

## 5. Delete Product

**DELETE** `/api/v1/products/:id`

- **Auth**: Required

---

> [!TIP]
>
> - Sistem otomatis mengambil gambar pertama sebagai `thumbnailUrl`.
> - Gunakan **Product Gallery** (array `images`) di halaman detail produk untuk meningkatkan kepercayaan buyer.
