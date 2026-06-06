# ADR: Redis Caching Tier A — BISA v25

## Status

Accepted — implemented June 2026.

## Context

Read-heavy reference endpoints (kategori, GIS, policies, shipping config) hit MySQL on every request. Stok/harga/cart **must stay fresh**.

## Decision

- **Redis cache-aside** via `cache.util.ts` + `config/redis.ts`
- **Tier A only:** static / admin-managed reference data
- **REDIS_ENABLED=false** default — graceful bypass to DB
- **No cache** for products list/detail, cart, wallet, orders, forum detail (viewCount write)

## TTL

| Domain | TTL |
|--------|-----|
| Categories, policies, FAQ | 6h |
| GIS regions, system constants, ship destinations | 24h |
| Support settings, payment channels | 1h |
| Product collections metadata | 1h |

## Invalidation

Admin mutations call `invalidateByPrefix` on related keys.

## Consequences

- Requires `REDIS_URL` + `REDIS_ENABLED=true` in production for benefit
- Multi-instance ready; rate-limit-redis deferred to F3
