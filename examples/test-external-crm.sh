#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-external-crm.sh
#
# End-to-end happy-path smoke test for /api/v1/external-crm.
# Walks: lookup → reserve → commit. Also includes a release branch (commented).
#
# Requires:  curl, jq
# Env vars:
#   INVENTORY_BASE    — default http://localhost:3000
#   INVENTORY_API_KEY — required, starts with "inv_"
#   PRODUCT_SKU       — sku of a real product in your org (required for lookup)
#   LOCATION_ID       — uuid of the location to reserve against (required)
#
# Usage:
#   export INVENTORY_API_KEY=inv_xxxxxxxxxxxxxxxxxxxxxxxx
#   export PRODUCT_SKU=MERC-100HR
#   export LOCATION_ID=11111111-2222-3333-4444-555555555555
#   bash examples/test-external-crm.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE="${INVENTORY_BASE:-http://localhost:3000}/api/v1/external-crm"
KEY="${INVENTORY_API_KEY:?must export INVENTORY_API_KEY=inv_…}"
SKU="${PRODUCT_SKU:?must export PRODUCT_SKU=… (sku of a real product in your org)}"
LOC="${LOCATION_ID:?must export LOCATION_ID=… (uuid of a real location)}"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Quiet curl wrapper that always emits the response body + status. Fails
# the script on transport error but lets the test inspect HTTP errors.
hit() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -w '\n@@STATUS@@%{http_code}@@')
  if [[ -n "$body" ]]; then args+=(-d "$body"); fi
  curl "${args[@]}" "$BASE$path"
}

split_status() {
  # stdin: response body with trailing @@STATUS@@nnn@@. emits body\nstatus.
  awk -v RS='@@STATUS@@' 'NR==1{body=$0} NR==2{sub("@@$","",$0); status=$0} END{print body; print status}'
}

# ──────────────────────────────────────────────────────────────────────────
bold "1. GET /products/lookup?sku=$SKU&location_id=$LOC"
LOOKUP_RAW=$(hit GET "/products/lookup?sku=$SKU&location_id=$LOC" | split_status)
LOOKUP_BODY=$(echo "$LOOKUP_RAW" | sed '$d')
LOOKUP_STATUS=$(echo "$LOOKUP_RAW" | tail -n1)
echo "$LOOKUP_BODY" | jq .
echo "HTTP $LOOKUP_STATUS"
if [[ "$LOOKUP_STATUS" != "200" ]]; then
  echo "Lookup failed — aborting." >&2; exit 1;
fi

PRODUCT_ID=$(echo "$LOOKUP_BODY" | jq -r '.data.product.id')
AVAILABLE=$(echo "$LOOKUP_BODY" | jq -r --arg loc "$LOC" '.data.stock[] | select(.location_id == $loc) | .quantity' | head -n1)
AVAILABLE="${AVAILABLE:-0}"
echo "→ product_id=$PRODUCT_ID  available=$AVAILABLE"

if (( AVAILABLE < 1 )); then
  echo "No stock available at $LOC for $SKU — aborting." >&2; exit 1;
fi

# ──────────────────────────────────────────────────────────────────────────
# A stable idempotency key so reruns of this script don't accumulate
# reservations — the second run gets the same one back as a no-op replay.
IDEM_KEY="external-crm-smoke:$(echo -n "$PRODUCT_ID-$LOC" | shasum | cut -c1-12)"

bold "2. POST /reservations  (qty=1, idempotency_key=$IDEM_KEY)"
RESERVE_BODY=$(jq -n \
  --arg pid "$PRODUCT_ID" \
  --arg loc "$LOC" \
  --arg idem "$IDEM_KEY" \
  '{
    product_id:      $pid,
    location_id:     $loc,
    quantity:        1,
    reference:       "smoke-test",
    idempotency_key: $idem,
    notes:           "Created by examples/test-external-crm.sh"
  }')
RESERVE_RAW=$(hit POST "/reservations" "$RESERVE_BODY" | split_status)
RESERVE_RESP=$(echo "$RESERVE_RAW" | sed '$d')
RESERVE_STATUS=$(echo "$RESERVE_RAW" | tail -n1)
echo "$RESERVE_RESP" | jq .
echo "HTTP $RESERVE_STATUS"

if [[ "$RESERVE_STATUS" != "200" && "$RESERVE_STATUS" != "201" ]]; then
  echo "Reservation failed — aborting." >&2; exit 1;
fi

RESERVATION_ID=$(echo "$RESERVE_RESP" | jq -r '.data.id')
RESERVATION_STATUS=$(echo "$RESERVE_RESP" | jq -r '.data.status')
echo "→ reservation_id=$RESERVATION_ID status=$RESERVATION_STATUS"

# ──────────────────────────────────────────────────────────────────────────
bold "3. POST /reservations/$RESERVATION_ID/commit"
COMMIT_RAW=$(hit POST "/reservations/$RESERVATION_ID/commit" '{"reference":"INV-SMOKE-001","notes":"committed by smoke test"}' | split_status)
COMMIT_RESP=$(echo "$COMMIT_RAW" | sed '$d')
COMMIT_STATUS=$(echo "$COMMIT_RAW" | tail -n1)
echo "$COMMIT_RESP" | jq .
echo "HTTP $COMMIT_STATUS"

if [[ "$COMMIT_STATUS" != "200" ]]; then
  echo "Commit failed — aborting." >&2; exit 1;
fi

FINAL_STATUS=$(echo "$COMMIT_RESP" | jq -r '.data.status')
echo "→ reservation final status=$FINAL_STATUS  (expected: committed)"

# ──────────────────────────────────────────────────────────────────────────
bold "4. GET /stock?product_ids=$PRODUCT_ID&location_id=$LOC  (post-commit)"
STOCK_RAW=$(hit GET "/stock?product_ids=$PRODUCT_ID&location_id=$LOC" | split_status)
STOCK_RESP=$(echo "$STOCK_RAW" | sed '$d')
STOCK_STATUS=$(echo "$STOCK_RAW" | tail -n1)
echo "$STOCK_RESP" | jq .
echo "HTTP $STOCK_STATUS"

POST_AVAILABLE=$(echo "$STOCK_RESP" | jq -r --arg loc "$LOC" '.data.stock[] | select(.location_id == $loc) | .quantity' | head -n1)
echo
bold "✓ Happy path complete."
echo "Before: available=$AVAILABLE   After: available=$POST_AVAILABLE   (expected: AVAILABLE − 1)"

# ──────────────────────────────────────────────────────────────────────────
# Uncomment to also smoke-test the release branch:
#
# bold "EXTRA: POST /reservations (fresh) → POST /reservations/<id>/release"
# RESERVE2=$(hit POST "/reservations" \
#   "$(jq -n --arg pid "$PRODUCT_ID" --arg loc "$LOC" \
#       '{product_id:$pid, location_id:$loc, quantity:1, reference:"release-test"}')" \
#   | split_status | sed '$d')
# RID2=$(echo "$RESERVE2" | jq -r '.data.id')
# echo "Created $RID2"
# hit POST "/reservations/$RID2/release" '{"notes":"releasing in smoke test"}' \
#   | split_status | sed '$d' | jq .
