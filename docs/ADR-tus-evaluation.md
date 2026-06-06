# ADR: Evaluasi TUS vs R2 Multipart (v24 follow-up)

## Status

Evaluated — **TUS tidak diadopsi** untuk v24.

## Context

TUS (resumable upload protocol) menawarkan resume standar offline-first dengan server TUS dedicated.

## Decision

Tetap **S3/R2 multipart + sesi DB** karena:

| Aspek | R2 Multipart (chosen) | TUS |
|-------|----------------------|-----|
| Infra | Sudah pakai R2 + AWS SDK | Server TUS + storage adapter baru |
| Mobile | Dio PUT per chunk — sudah implemented | Package `tus_client` + lifecycle |
| Admin web | Fetch PUT presigned/proxy | Endpoint TUS terpisah |
| Resume | `GET session` + skip parts | Native TUS offset |
| Kompleksitas | Sedang | Tinggi |

## Consequences

- Resume setelah app killed: `MediaUploadSessionStore` (SharedPreferences) + backend session TTL 24h.
- Offline-first penuh (upload tanpa jaringan, sync later) **belum** — butuh queue lokal + TUS di fase terpisah jika diminta product.

## Revisit trigger

Adopsi TUS jika:

1. Requirement upload video >500MB dengan pause/resume multi-hari
2. Banyak user di jaringan satelit dengan disconnect >24 jam
3. Tim infra siap host `tusd` + monitoring terpisah
