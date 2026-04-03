# Notifications API Documentation (`/api/v1/notifications`)

Dokumentasi ini mencakup rute untuk mengelola notifikasi pengguna (Digital Twin Alert, Status Order, Dll).

## 1. List Notifications

**GET** `/api/v1/notifications`

- **Auth**: Required
- **QueryParams**:
  - `page`: (Opsional) Default 1
  - `limit`: (Opsional) Default 20
  - `unreadOnly`: (Opsional) `true` untuk mengambil hanya yang belum dibaca.
- **Response**:

```json
{
  "meta": {
    "success": true,
    "status": 200,
    "message": "Daftar notifikasi berhasil diambil"
  },
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Pesanan Baru Masuk",
      "message": "Anda menerima pesanan baru dari Mitra #BISA-982",
      "type": "ORDER",
      "isRead": false,
      "metadata": { "orderId": "uuid" },
      "createdAt": "2026-03-31T05:00:00Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

## 2. Mark as Read

**PATCH** `/api/v1/notifications/:id/read`

- **Auth**: Required
- **Description**: Menandai satu notifikasi tertentu sebagai terbaca (`isRead: true`).

## 3. Mark ALL as Read

**PATCH** `/api/v1/notifications/read-all`

- **Auth**: Required
- **Description**: Menandai seluruh notifikasi milik user tersebut sebagai terbaca.

## 4. Delete Notification

**DELETE** `/api/v1/notifications/:id`

- **Auth**: Required
- **Description**: Menghapus notifikasi secara permanen.

---

> [!IMPORTANT]
>
> - Endpoint ini menggunakan **RequireAuth** middleware untuk memastikan `userId` pada notifikasi selalu cocok dengan pemilik token yang sedang login.
> - Notifikasi bersifat real-time dari sisi database, namun untuk real-time UI disarankan menggunakan polling atau integrasi WebSocket di masa mendatang.
