# R2 CORS — Chunked Media Upload (Production)

## Kapan diperlukan

Set `MEDIA_UPLOAD_PROXY_MODE=false` di production agar mobile/admin upload **langsung ke R2** via presigned PUT. Browser dan app perlu CORS di bucket R2.

## Konfigurasi Cloudflare R2

Dashboard → R2 → bucket → **Settings** → **CORS policy**:

```json
[
  {
    "AllowedOrigins": [
      "https://app.bisa.id",
      "https://admin.bisa.id",
      "capacitor://localhost",
      "http://localhost:*"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Env backend

```env
MEDIA_UPLOAD_PROXY_MODE=false
R2_CORS_ALLOWED_ORIGINS=https://app.bisa.id,https://admin.bisa.id
```

`R2_CORS_ALLOWED_ORIGINS` dipakai untuk dokumentasi/validasi deploy — policy aktual di-set di dashboard R2.

## Verifikasi

```bash
curl -I -X OPTIONS "https://<account>.r2.cloudflarestorage.com/<bucket>/test" \
  -H "Origin: https://admin.bisa.id" \
  -H "Access-Control-Request-Method: PUT"
```

Response harus memuat `Access-Control-Allow-Origin` dan `Access-Control-Expose-Headers: ETag`.

## Dev tanpa CORS

Gunakan proxy mode:

```env
MEDIA_UPLOAD_PROXY_MODE=true
```

Chunk di-PUT ke backend (`PUT /api/v1/media/uploads/:id/parts/:n`), backend forward ke R2.
