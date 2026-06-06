# ADR: Chunked Media Upload (v24)

## Status

Accepted — implemented June 2026.

## Context

Upload monolitik (`multer.memoryStorage` + single HTTP request) menyebabkan timeout mobile (30s) dan gagal saat banyak media.

## Decision

1. **R2 Multipart Upload** dengan sesi DB `MediaUploadSession`.
2. **Development:** `MEDIA_UPLOAD_PROXY_MODE=true` — chunk via `PUT /api/v1/media/uploads/:id/parts/:n`.
3. **Production:** presigned PUT langsung ke R2 (`MEDIA_UPLOAD_PROXY_MODE=false`).
4. Mobile `ChunkedMediaUploadService` — retry per chunk, timeout 120s/chunk.
5. Produk: upload gambar dulu → `imageUrls[]` di create/update (tanpa multipart images).

## Consequences

- Perlu migrasi DB `media_upload_sessions`.
- R2 production perlu CORS PUT dari origin mobile.
- Legacy `POST /system/upload` tetap ada (deprecated).
