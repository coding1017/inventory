# External CRM Integration

REST surface for an external service-business CRM (e.g. `fieldcrm`) to look up parts and reserve stock against quotes/invoices. All endpoints live under `/api/v1/external-crm/`.

- **Base URL (dev):** `http://localhost:3000/api/v1/external-crm`
- **Base URL (prod):** `https://<your-inventory-host>/api/v1/external-crm`
- **Companion type defs:** [`src/lib/external-crm-types.ts`](src/lib/external-crm-types.ts) — copy into the consumer codebase verbatim for type-safe access.

---

## Quick reference

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `GET`  | `/products/lookup?sku=…&barcode=…&location_id=…` | `read` | Resolve a part for a quote line item |
| `POST` | `/reservations` | `reserve` | Hold stock against a quote |
| `POST` | `/reservations/:id/commit` | `reserve` | Convert reservation → sale (invoice paid) |
| `POST` | `/reservations/:id/release` | `reserve` | Un-reserve (quote declined / cancelled) |
| `GET`  | `/stock?product_ids=…&location_id=…` | `read` | Bulk "available at location X" badges |

Every endpoint also accepts `OPTIONS` (CORS preflight, returns 204).

---

## Authentication

Every request must include:

```
Authorization: Bearer inv_<raw-api-key>
```

The key is SHA-256-hashed server-side and matched against `inv_api_keys.key_hash`. Properties enforced:

- `is_active = true`
- `expires_at` in the future (or `null`)
- `permissions[]` includes the route's required permission
- `rate_limit` requests per minute (sliding 1-minute window, enforced via `inv_check_rate_limit`)

The key is **org-scoped** — every request implicitly operates on the key's `org_id`. Endpoints that accept `?org_id=` use it as a defence-in-depth cross-check and 403 with `ORG_MISMATCH` if it disagrees with the key's org.

### Setting up a key

Use the inventory admin UI: **Settings → API Keys → New key**. Suggested permission sets for an external CRM:

- `["read"]` — lookup + stock only
- `["read", "reserve"]` — full reserve/commit/release flow

The `reserve` permission is treated as the required permission for all mutating routes. Add additional permissions to the key only if you also intend to call other `/api/v1/*` endpoints (e.g. `adjust`, `write`).

---

## Response envelope

Every response shares the same JSON envelope:

```json
{
  "data":  <object | null>,
  "meta":  <object | null>,
  "error": { "code": "STRING_CODE", "message": "human readable" } | null
}
```

- HTTP **2xx**: `data` populated, `error` null.
- HTTP **4xx / 5xx**: `data` null, `error` populated.

### Error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query fails schema |
| 400 | `INVALID_JSON` | Body wasn't JSON |
| 401 | `UNAUTHORIZED` | Missing / invalid / expired key |
| 403 | `FORBIDDEN` | Key lacks the required permission |
| 403 | `ORG_MISMATCH` | `?org_id=` disagrees with the key's org |
| 404 | `PRODUCT_NOT_FOUND` | No product matches the lookup |
| 404 | `RESERVATION_NOT_FOUND` | No reservation with that id in this org |
| 409 | `INSUFFICIENT_STOCK` | Not enough free stock to reserve |
| 409 | `RESERVATION_NOT_ACTIVE` | Reservation already committed / released |
| 429 | `RATE_LIMITED` | Per-key 1-minute budget exhausted. Includes `Retry-After: 60` header. |
| 500 | `QUERY_ERROR` / `ADJUST_ERROR` | Inventory database error |

---

## Endpoints

### `GET /products/lookup`

Quick lookup for a quote line item. Either `?sku=` or `?barcode=` is required (sku wins if both are provided).

**Query**

| Param | Type | Required | Notes |
|---|---|---|---|
| `sku` | string | one of `sku`/`barcode` | Exact match on `inv_products.sku` |
| `barcode` | string | one of `sku`/`barcode` | Exact match on `inv_products.barcode` |
| `location_id` | uuid | no | Scope the returned `stock[]` to one location |
| `org_id` | uuid | no | Defence-in-depth cross-check |

**Response — 200**

```json
{
  "data": {
    "product": {
      "id": "…",
      "sku": "MERC-100HR",
      "name": "Mercury 100hr Service Kit",
      "barcode": "012345678905",
      "cost_price": 84.50,
      "sell_price": 149.00,
      "…": "…"
    },
    "variants": [
      { "id": "…", "sku": "MERC-100HR-V6", "name": "V6 outboards", "…": "…" }
    ],
    "stock": [
      {
        "product_id": "…",
        "variant_id": null,
        "location_id": "…",
        "location_name": "Mims (EC)",
        "quantity": 12,
        "reserved": 2,
        "on_hand": 14
      }
    ]
  },
  "meta": null,
  "error": null
}
```

**Stock semantics — important**

- `quantity` = stock **available to reserve** (reservations have already deducted from this number).
- `reserved` = informational count of units currently held by active reservations.
- `on_hand` = `quantity + reserved` = physical units on the shelf.

A consumer building a quote should check `quantity >= line_qty` before reserving.

---

### `POST /reservations`

Hold N units against a quote. Idempotent if `idempotency_key` is provided.

**Body**

```json
{
  "product_id":      "uuid",
  "variant_id":      "uuid | null",
  "location_id":     "uuid",
  "quantity":        5,
  "reference":       "QUOTE-2026-0042",
  "idempotency_key": "fieldcrm-quote-line-9c3a:reserve-v1",
  "expires_at":      "2026-06-13T18:00:00Z",
  "notes":           "Held for Steve at Mims"
}
```

- `quantity` must be a positive integer.
- `reference` is free-form. Recommended: the consumer's quote-line id.
- `idempotency_key` is **strongly recommended** for any consumer that may retry on network errors. Scoped to the org. Reuse with a different `(product_id, location_id, quantity)` is **not** detected — keep the key 1:1 with the underlying intent.
- `expires_at` is informational only — the inventory service does NOT currently auto-release. (Consumers that need auto-release should run their own sweep that calls `POST /reservations/:id/release`. Built-in sweep is a planned follow-up.)

**Response — 201 (or 200 on idempotent replay)**

The full reservation row — see the `Reservation` type in `external-crm-types.ts`.

```json
{
  "data": {
    "id":                            "uuid",
    "org_id":                        "uuid",
    "product_id":                    "uuid",
    "variant_id":                    null,
    "location_id":                   "uuid",
    "quantity":                      5,
    "status":                        "active",
    "reference":                     "QUOTE-2026-0042",
    "idempotency_key":               "fieldcrm-quote-line-9c3a:reserve-v1",
    "notes":                         "Held for Steve at Mims",
    "reserve_movement_id":           "uuid",
    "commit_unreserve_movement_id":  null,
    "commit_sale_movement_id":       null,
    "release_movement_id":           null,
    "expires_at":                    "2026-06-13T18:00:00Z",
    "created_at":                    "2026-06-06T14:32:11Z",
    "updated_at":                    "2026-06-06T14:32:11Z",
    "committed_at":                  null,
    "released_at":                   null
  },
  "meta": null,
  "error": null
}
```

**Errors**

- `409 INSUFFICIENT_STOCK` if `inv_stock.quantity` for that (product, variant, location) is less than `quantity`.
- `400 VALIDATION_ERROR` if `quantity <= 0`.
- `429 RATE_LIMITED`.

---

### `POST /reservations/:id/commit`

Convert an active reservation into a real sale. Idempotent on already-committed reservations.

**Body** (optional)

```json
{ "reference": "INV-2026-0042", "notes": "Paid in full" }
```

`reference` overrides the original reservation's reference on the *sale* movement only (the existing `unreserved` movement still references the reservation id). Use it to thread the invoice number into your COGS audit trail.

**Response — 200**

Same `Reservation` shape. `status = "committed"`, `committed_at`, `commit_unreserve_movement_id`, and `commit_sale_movement_id` all populated.

**Side effects in the inventory DB**

1. Two new rows in `inv_movements`:
   - `type='unreserved', quantity=+N` — undoes the hold (audit-only — the stock change nets out).
   - `type='sale', quantity=-N` — real sale, for COGS reporting.
2. `inv_stock.reserved` decremented by N. `inv_stock.quantity` unchanged (already dropped when the reservation was created).

**Errors**

- `404 RESERVATION_NOT_FOUND`
- `409 RESERVATION_NOT_ACTIVE` if the reservation is `released` or `expired`.

---

### `POST /reservations/:id/release`

Un-reserve N units. Use when the consumer's quote is declined / the job is cancelled. Idempotent.

**Body** (optional)

```json
{ "notes": "Customer declined quote" }
```

**Response — 200**

Same `Reservation` shape. `status = "released"`, `released_at`, `release_movement_id` populated.

**Side effects in the inventory DB**

- One row in `inv_movements`: `type='unreserved', quantity=+N`.
- `inv_stock.quantity` incremented by N. `inv_stock.reserved` decremented by N.

**Errors**

- `404 RESERVATION_NOT_FOUND`
- `409 RESERVATION_NOT_ACTIVE` if the reservation is already `committed`.

---

### `GET /stock`

Bulk per-location stock snapshot for an array of product ids. Use this for "5 available at Mims" badges across an entire quote line-item list.

**Query**

| Param | Type | Required | Notes |
|---|---|---|---|
| `product_ids` | comma-separated uuids | yes | Max 100 |
| `location_id` | uuid | no | Scope to one location |
| `org_id` | uuid | no | Defence-in-depth cross-check |

**Response — 200**

```json
{
  "data": {
    "stock": [
      { "product_id": "…", "variant_id": null, "location_id": "…", "location_name": "Mims (EC)", "quantity": 12, "reserved": 2, "on_hand": 14 },
      { "product_id": "…", "variant_id": null, "location_id": "…", "location_name": "Parrish (WC)", "quantity":  3, "reserved": 0, "on_hand":  3 }
    ]
  },
  "meta": null,
  "error": null
}
```

Same `quantity` / `reserved` / `on_hand` semantics as `/products/lookup`.

---

## Idempotency guarantees

| Operation | Idempotent? | How |
|---|---|---|
| `POST /reservations` | Yes, if `idempotency_key` is provided | Replays return the existing reservation (200 OK, not 201) — no new movement is created. |
| `POST /reservations/:id/commit` | Yes, unconditionally | Re-commit of an already-committed reservation is a no-op — same row returned. |
| `POST /reservations/:id/release` | Yes, unconditionally | Re-release of an already-released or expired reservation is a no-op. |
| `GET /products/lookup` | n/a (read) | — |
| `GET /stock` | n/a (read) | — |

The two idempotent state transitions you cannot cross: a `committed` reservation cannot be released, and a `released` reservation cannot be committed. Both surface as `409 RESERVATION_NOT_ACTIVE`.

---

## Audit trail

Every state change leaves rows in `inv_movements`. To trace the lifecycle of a reservation:

```sql
select m.*
from inv_movements m
where m.reference = 'reservation:<reservation-id>'
   or m.id in (
        select reserve_movement_id from inv_reservations where id = '<reservation-id>'
        union select commit_unreserve_movement_id from inv_reservations where id = '<reservation-id>'
        union select commit_sale_movement_id from inv_reservations where id = '<reservation-id>'
        union select release_movement_id from inv_reservations where id = '<reservation-id>'
   )
order by m.created_at;
```

The reservation row itself stores the direct links via `*_movement_id` columns.

---

## End-to-end recipe (quote → invoice)

1. Consumer builds a quote line item. They call **`GET /products/lookup?sku=MERC-100HR&location_id=<mims>`** to resolve the part and confirm stock.
2. Consumer creates the quote in their DB.
3. For each line item that's a stocked part, consumer calls **`POST /reservations`** with `reference="QUOTE-2026-0042:line-3"` and a stable `idempotency_key`. They store the returned `reservation.id` alongside the line item.
4. Customer signs the quote → consumer flips quote → job → invoice.
5. Invoice marked paid → consumer calls **`POST /reservations/<id>/commit`** with `reference="INV-2026-0042"` for each line item's reservation.
6. If the quote is declined or the job is cancelled, consumer calls **`POST /reservations/<id>/release`** for each reservation.
7. Periodically (e.g. nightly), consumer scans its own DB for quotes older than N days that are still open and calls `POST /reservations/<id>/release` to free held stock.

See [`examples/test-external-crm.sh`](examples/test-external-crm.sh) for an executable curl version of the reserve → commit happy path.

---

## What this surface does NOT do (yet)

- **No automatic expiry of reservations.** Consumers must release their own.
- **No partial commits.** A 5-unit reservation either fully commits or fully releases — no commit-3-release-2 split. Workaround: release the full reservation and create a fresh one for the smaller quantity.
- **No batch reserve.** Each line item is a separate `POST /reservations` call. Network-cost-wise this is fine for typical 1–20-line-item quotes; if a consumer needs >50 reservations per quote, consider a batch follow-up.

---

## Outbound webhooks

Inventory publishes events as signed HTTP POSTs to URLs you register, so consumers don't have to poll.

### Subscribe

```
POST /api/v1/external-crm/webhooks/subscriptions
Authorization: Bearer inv_...   (requires "webhooks_admin" permission)
Content-Type: application/json

{
  "name":   "fieldcrm prod",
  "url":    "https://api.fieldcrm.example/webhooks/inventory",
  "events": ["reservation.committed", "stock.low_stock"]
}
```

Empty `events` array = subscribe to all events.

**Response 201** returns the full subscription row including a `secret` field starting with `whsec_`. **This is the only time the secret is returned in plaintext** — persist it immediately. Subsequent GETs / PATCHes never include it.

### Manage

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/webhooks/subscriptions`         | list (secret stripped) |
| `POST`   | `/webhooks/subscriptions`         | create + mint secret |
| `PATCH`  | `/webhooks/subscriptions/:id`     | update `name`/`url`/`events`/`is_active` |
| `DELETE` | `/webhooks/subscriptions/:id`     | hard delete |

### Event catalog (v1)

| Event | Fired when | Payload `data` |
|---|---|---|
| `reservation.created`   | POST /reservations succeeds | Full `Reservation` row |
| `reservation.committed` | POST /reservations/:id/commit succeeds AND status flipped to `committed` | `Reservation` row + `invoice_reference` |
| `reservation.released`  | POST /reservations/:id/release succeeds AND status flipped to `released` | `Reservation` row + `release_notes` |
| `stock.low_stock`       | inv_stock.quantity dropped through `low_stock_threshold` (above 0) | `{ product_id, variant_id, location_id, quantity, reserved, low_stock_threshold }` |
| `stock.out_of_stock`    | inv_stock.quantity reached 0 from above | same shape as `low_stock` |

Idempotent re-fires (e.g. committing an already-committed reservation) **do not** re-publish events.

### Delivery envelope

Each POST body has this shape:

```json
{
  "id":           "evt_<event_uuid>",
  "event":        "reservation.committed",
  "org_id":       "<sender org uuid>",
  "data":         { ...event-specific... },
  "created_at":   "2026-06-06T16:59:21Z",
  "delivered_at": "2026-06-06T17:00:01Z",
  "attempt":      1
}
```

### Verifying the signature

Every request includes these headers:

| Header | Value |
|---|---|
| `X-Webnari-Event`       | event name |
| `X-Webnari-Delivery-Id` | UUID of this delivery attempt — use for dedup |
| `X-Webnari-Signature`   | `hex(HMAC-SHA256(subscription.secret, raw_body))` |
| `X-Webnari-Attempt`     | 1-based retry counter |

**TypeScript verification recipe** (consumer-side):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyInventoryWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Both buffers must be same length for timingSafeEqual.
  if (signatureHeader.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(signatureHeader, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}
```

Read the **raw body** before JSON parsing — even a re-serialized canonical body will produce a different signature.

### Retry policy

| Attempt | Backoff before this attempt |
|---|---|
| 1 | immediate |
| 2 | +1 min |
| 3 | +5 min |
| 4 | +15 min |
| 5 | +1 hour |
| ≥6 | not retried — status flips to `exhausted` |

Any 2xx response = success. Anything else (including network timeouts at 10s) = failure → schedule next attempt.

### Operating the delivery worker

The delivery side runs as a route handler that drains the queue. Both `GET` and `POST` are accepted so it works with any cron platform:

```
GET  /api/v1/external-crm/webhooks/deliver        (for Vercel Cron — GET-only)
POST /api/v1/external-crm/webhooks/deliver        (for everything else)
```

Auth is tried in this order:
1. `X-Cron-Secret: <env CRON_SECRET>` header — manual / external cron services
2. `Authorization: Bearer <env CRON_SECRET>` — Vercel Cron's auto-injected pattern
3. `Authorization: Bearer inv_…` with `webhooks_admin` permission — per-org drain (only that org's queue), useful for ops debugging

Schedule it every 60 seconds. The body is empty; the response summarizes work done: `{ claimed, success, failed, exhausted, skipped }`.

#### Setup recipe: Vercel Cron (recommended)

`vercel.json` (already shipped in this repo) wires it up:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/v1/external-crm/webhooks/deliver?via=vercel-cron",
      "schedule": "* * * * *"
    }
  ]
}
```

Set `CRON_SECRET` in the Vercel project's env vars (any opaque secret — 32 hex chars is fine). Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}` on each cron fire. **Vercel Hobby tier caps cron schedules at once per day** — minute-level granularity requires Pro.

#### Setup recipe: Supabase pg_cron (works anywhere)

If the inventory app isn't on Vercel or you want a second, redundant cron:

1. Apply `supabase/005_webhook_cron_optional.sql` in the SQL editor. This:
   - Enables `pg_cron` + `pg_net`
   - Creates `inv_webhook_cron_config` (single-row table with the URL + cron secret)
   - Schedules a 1-minute job that calls `inv_webhook_cron_tick()` which fires `pg_net.http_post` against the deliver endpoint
2. Insert the config row:
   ```sql
   insert into inv_webhook_cron_config (url, cron_secret)
   values ('https://your-inventory-domain/api/v1/external-crm/webhooks/deliver',
           'whcron_<some-secret>');
   ```
3. The `cron_secret` value must match `CRON_SECRET` on the inventory deployment.
4. Disable later via `select cron.unschedule('inv-webhook-deliver');`

The `pg_cron` extension may need to be enabled from the Supabase Dashboard → Database → Extensions page before SQL access works.

#### Setup recipe: external cron service (cron-job.org, etc.)

Point any HTTP cron at:
```
POST https://your-inventory-domain/api/v1/external-crm/webhooks/deliver
Header: X-Cron-Secret: <env CRON_SECRET>
Schedule: every 1 minute
```

### What this DOESN'T guarantee

- **No exactly-once delivery.** At-least-once. Deduplicate on `X-Webnari-Delivery-Id` if you write side-effects.
- **No ordering across events.** Each delivery is independent. If you depend on order (e.g. `reservation.created` before `reservation.committed`), reconcile against the reservation's `status` field, not on event ordering.
- **No automatic backfill.** Deliveries that exhaust their retry budget stay in `inv_webhook_deliveries` with `status='exhausted'` for inspection — they are not retried automatically.

---

## Rate limits

Per-API-key, 1-minute sliding window, enforced via Postgres. Default `inv_api_keys.rate_limit = 100`. The limit is checked **once per request** at the auth layer — endpoints that internally fan out (e.g. `/stock` returning many rows) still count as a single request.

A blocked request returns `429 RATE_LIMITED` and includes:

```
Retry-After: 60
X-RateLimit-Limit: 100
```

Rate-limit infrastructure errors (e.g. usage-counter DB problem) fail **open** — the request is allowed through and the error is logged server-side. This prevents an inventory infra blip from cascading into a CRM outage.

---

## Migration

The reservations table and helper functions ship as `supabase/003_reservations.sql`. Apply after `002_organizations.sql`. The migration is purely additive — no existing tables are altered.

---

## TypeScript

Consumers using TypeScript should copy [`src/lib/external-crm-types.ts`](src/lib/external-crm-types.ts) into their codebase. It has zero runtime dependencies — pure type defs. Example consumer call site:

```ts
import type {
  CreateReservationRequest,
  Envelope,
  Reservation,
} from "./external-crm-types";

const res = await fetch(`${INVENTORY_BASE}/reservations`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${INVENTORY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    product_id: "…",
    location_id: "…",
    quantity: 5,
    reference: `QUOTE-${quote.id}:line-${line.id}`,
    idempotency_key: `fieldcrm-${quote.id}-${line.id}:reserve-v1`,
  } satisfies CreateReservationRequest),
});

const body = (await res.json()) as Envelope<Reservation>;
if (body.error) {
  throw new Error(`[${body.error.code}] ${body.error.message}`);
}
// body.data is a fully-typed Reservation.
```
