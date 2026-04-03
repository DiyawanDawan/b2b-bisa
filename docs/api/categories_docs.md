# Category API Documentation

Endpoints untuk navigasi katalog produk biomassa dan biochar di marketplace BISA B2B.

## 1. List Categories (Public)

**GET** `/api/v1/categories`

- **Auth**: Public
- **QueryParams**:
  - `page`: (Opsional) Default 1
  - `limit`: (Opsional) Default 20
  - `type`: `PRODUK`, `FORUM`, `ARTICLE`
- **Response**:

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar kategori berhasil diambil",
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  },
  "data": [
    {
      "id": "uuid-kategori",
      "name": "Limbah Biomassa",
      "categoryType": "PRODUK",
      "_count": { "products": 25 }
    }
  ]
}
```

## 2. Get Category Detail

**GET** `/api/v1/categories/:id`

- **Auth**: Public
- **Description**: Mengambil detail kategori tunggal beserta jumlah produk yang terdaftar.

---

> [!IMPORTANT]
>
> - Gunakan `/api/v1/categories?type=PRODUK` untuk menyaring kategori yang digunakan di Marketplace.
> - Relasi `_count` menginformasikan jumlah item aktif di kategori tersebut.
