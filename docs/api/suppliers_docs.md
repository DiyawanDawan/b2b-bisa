# Supplier Directory API Documentation

Endpoints untuk direktori publik mitra supplier terverifikasi di BISA B2B.

## 1. List Suppliers (Public Directory)

**GET** `/api/v1/suppliers`

- **Auth**: Public
- **QueryParams**:
  - `page`: (Opsional) Default 1
  - `limit`: (Opsional) Default 10
  - `province`: (Opsional) Filter berdasarkan Provinsi
  - `regency`: (Opsional) Filter berdasarkan Kabupaten
- **Response**:

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar supplier berhasil diambil",
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "totalPages": 10
    }
  },
  "data": [
    {
      "id": "uuid-supplier",
      "fullName": "PT Solusi Biomassa Nusantara",
      "avatarUrl": "url-avatar",
      "province": "Jawa Tengah",
      "regency": "Semarang",
      "tier": "PRO",
      "profile": { "companyName": "PT SBN", "businessType": "Distributor" },
      "verification": { "isVerified": true },
      "_count": { "products": 15 }
    }
  ]
}
```

## 2. Get Supplier Detail (Deep Detail)

**GET** `/api/v1/suppliers/:id`

- **Auth**: Public (Optional)
- **Description**: Mengambil detail profil mendalam supplier termasuk verifikasi KYC, portofolio profil bisnis, dan katalog produk terbatas.

---

> [!NOTE]
>
> - Gunakan `/api/v1/suppliers?province=Jawa+Tengah` untuk mengambil daftar supplier khusus di wilayah tertentu.
> - Data verifikasi diinformasikan melalui field `verification.isVerified` untuk membangun integritas transaksi.
