# ADR: Readiness Gates (v26)

## Konteks

Supplier bisa publish produk tanpa data toko lengkap; buyer bisa negosiasi/checkout tanpa alamat. Ini menyebabkan gagal ongkir/tagihan di tahap akhir.

## Keputusan

### Supplier (`STORE_NOT_READY`)

Wajib sebelum produk **ACTIVE**:

| Key | Sumber |
|-----|--------|
| `companyName` | `UserProfile.companyName` atau `UserVerification.businessName` |
| `phone` | `User.phone` (10–15 digit) |
| `storeLocation` | `User.province`+`regency` atau alamat profil GIS |
| `businessAddress` | Alamat profil / verifikasi (min 10 char) |
| `rajaongkirOriginId` | `UserProfile.rajaongkirOriginId` |
| `kycVerified` | `UserVerification.isVerified` (hanya jika `REQUIRE_KYC_FOR_ACTIVE_PRODUCT=true`) |

DRAFT produk **tidak** di-gate. ADMIN bypass kecuali `READINESS_ENFORCE_ADMIN=true`.

### Buyer (`BUYER_NOT_READY`)

Wajib sebelum `POST /negotiations` dan direct checkout:

| Key | Sumber |
|-----|--------|
| `shippingAddress` | `CustomerAddress` primary atau `User.address` |
| `recipientPhone` | `User.phone` atau `Address.phoneNumber` |
| `shippingRegion` | GIS province/regency atau `User.regency` |

Checkout juga memanggil `assertShippingDestinationReady` + `assertDirectCheckoutShippingReady` (wajib ongkir per supplier).

### API

`GET /api/v1/users/me/readiness` → `{ store?, buyer? }` dengan `missing[]` + `messages[]`.

Error: HTTP 422, `meta.code` = `STORE_NOT_READY` | `BUYER_NOT_READY`.

### Env

- `READINESS_GATES_ENABLED=false` — matikan semua gate (dev)
- `READINESS_ENFORCE_ADMIN=true` — admin ikut gate toko
- `REQUIRE_KYC_FOR_ACTIVE_PRODUCT=true` — supplier wajib KYC verified untuk produk ACTIVE

### Auto-save RajaOngkir destination (buyer address)

Saat create/update `CustomerAddress`, backend best-effort memanggil `syncCustomerAddressRajaOngkirDestination` dan menyimpan `rajaongkirDestinationId` jika belum ada.

### Admin dossier

`GET /api/v1/admin/users/:id/dossier` menyertakan `readiness` (store + buyer) untuk indikator kelengkapan profil.

## Implementasi

- `Backend/src/utils/readiness.util.ts`
- Mobile: `lib/core/readiness/*` + gate sebelum navigasi aksi
