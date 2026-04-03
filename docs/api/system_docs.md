# System Constants API Documentation (`/api/v1/system`)

Dokumentasi ini mencakup rute publik untuk mendapatkan data sistem guna menyinkronkan Frontend (FE) dengan Backend (BE).

## 1. System Constants/Enums

**GET** `/api/v1/system/constants`

- **Auth**: Public
- **Description**: Mengambil seluruh daftar Enum Prisma yang didefinisikan di `schema.prisma`. Endpoint ini wajib digunakan oleh FE untuk memetakan dropdown (Role, Kategori, Status Order, Dll).

### 1.1 Response Structure

```json
{
  "success": true,
  "data": {
    "UserRole": ["SUPPLIER", "BUYER", "ADMIN"],
    "UserTier": ["FREE", "PRO"],
    "VerificationStatus": ["PENDING", "VERIFIED", "REJECTED"],
    "UnitStatus": ["KG", "TON"],
    "BiocharGrade": ["GRADE_A", "GRADE_B", "GRADE_C"],
    "BiomassaType": [
      "SEKAM_PADI",
      "TONGKOL_JAGUNG",
      "CANGKANG_SAWIT",
      "TEMPURUNG_KELAPA",
      "KAYU_KERAS",
      "LAINNYA"
    ],
    "OrderStatus": [
      "PENDING",
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "COMPLETED"
    ],
    "ShipmentType": ["LAND_CARGO", "SEA_CARGO", "AIR_FREIGHT"],
    "VesselType": ["TRUCK_CARGO", "CONTAINER_SHIP", "BULK_CARRIER"],
    "NegotiationStatus": [
      "OPEN_NEGOTIATION",
      "OFFER_SUBMITTED",
      "OFFER_ACCEPTED",
      "OFFER_REJECTED",
      "LOCKED",
      "CANCELLED"
    ]
  },
  "message": "Konstanta sistem berhasil diambil"
}
```

> [!TIP]
> Gunakan endpoint ini di level root aplikasi Frontend untuk mengisi global state/context agar sinkronisasi tipe data selalu terjaga.

---

## 2. GIS Multilevel (Public)

**GET** `/api/v1/gis/regions`

- **Auth**: Public
- **QueryParams**:
  - `level`: (Wajib) `country`, `province`, `regency`, `district`, `village`
  - `parentId`: (Opsional) ID parent (misal: ID Provinsi untuk mengambil daftar Kabupaten)
  - `search`: (Opsional) Nama wilayah
- **Description**: Endpoint dinamis untuk mengambil data wilayah bertingkat.
