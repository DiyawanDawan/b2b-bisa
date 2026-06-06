# Nginx / Reverse Proxy — Media Upload Proxy Mode

## Konteks

Saat `MEDIA_UPLOAD_PROXY_MODE=true`, klien mengirim chunk ke:

```
PUT /api/v1/media/uploads/:sessionId/parts/:partNumber
Content-Type: application/octet-stream
Body: raw bytes (hingga 5 MB per part)
```

Reverse proxy harus mengizinkan body besar dan timeout panjang.

## Nginx

```nginx
location /api/v1/media/uploads/ {
    client_max_body_size 10m;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_request_buffering off;
    proxy_pass http://127.0.0.1:3000;
}
```

## ngrok (development)

```yaml
# ngrok.yml — increase timeout jika perlu
tunnels:
  api:
    proto: http
    addr: 3000
    inspect: false
```

Default ngrok timeout ~60s — untuk file sangat besar prefer presigned R2 atau split part 5MB dengan retry.

## Express (sudah di backend)

Route proxy memakai raw body per chunk (bukan `multer.memoryStorage` full file). Pastikan middleware body parser **tidak** consume stream sebelum controller proxy.

## Monitoring

Log metric:

- `media_upload_sessions` status `COMPLETED` vs `ABORTED` vs `EXPIRED`
- Rate 413/408 di proxy layer

Cron `mediaUploadExpiry.ts` membersihkan sesi stale tiap jam.
