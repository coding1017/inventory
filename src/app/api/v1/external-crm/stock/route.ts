/**
 * GET /api/v1/external-crm/stock?org_id=…&location_id=…&product_ids=…
 *
 * Bulk stock query — for a CRM rendering "X available at Mims" badges
 * across an entire line-item list.
 *
 * Auth:   Bearer inv_…  (requires "read" permission)
 *
 * Query:
 *   product_ids   comma-separated UUIDs (required, max 100)
 *   location_id   optional — scope to one location
 *   org_id        optional cross-check (403 if it disagrees with the key)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import type {
  StockQueryResponse,
  StockSnapshot,
} from "@/lib/external-crm-types";

const MAX_PRODUCT_IDS = 100;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const auth = await verifyExternalCrmKey(request, { required: "read" });
  if (auth instanceof Response) return auth;

  const { searchParams } = request.nextUrl;
  const productIdsRaw = searchParams.get("product_ids");
  const locationId = searchParams.get("location_id");

  if (!productIdsRaw) {
    return apiError(
      "VALIDATION_ERROR",
      "?product_ids= is required (comma-separated UUIDs)",
      400
    );
  }

  const productIds = productIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (productIds.length === 0) {
    return apiError(
      "VALIDATION_ERROR",
      "?product_ids= must contain at least one UUID",
      400
    );
  }

  if (productIds.length > MAX_PRODUCT_IDS) {
    return apiError(
      "VALIDATION_ERROR",
      `?product_ids= exceeds max ${MAX_PRODUCT_IDS}; got ${productIds.length}`,
      400
    );
  }

  // Validate each UUID up front — better than per-row failures.
  const uuid = z.string().uuid();
  for (const pid of productIds) {
    if (!uuid.safeParse(pid).success) {
      return apiError(
        "VALIDATION_ERROR",
        `?product_ids contains non-UUID: ${pid}`,
        400
      );
    }
  }

  if (locationId && !uuid.safeParse(locationId).success) {
    return apiError(
      "VALIDATION_ERROR",
      `?location_id is not a UUID: ${locationId}`,
      400
    );
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("inv_stock")
    .select("product_id, variant_id, location_id, quantity, reserved")
    .eq("org_id", auth.orgId)
    .in("product_id", productIds);

  if (locationId) query = query.eq("location_id", locationId);

  const { data, error } = await query;
  if (error) return apiError("QUERY_ERROR", error.message, 500);

  // Resolve location names via a single IN query — same reason as in
  // /products/lookup: our typed types declare Relationships:[] so FK
  // joins fail type-check.
  const rows = data ?? [];
  const locationIds = Array.from(new Set(rows.map((r) => r.location_id)));
  let nameById = new Map<string, string>();
  if (locationIds.length > 0) {
    const { data: locs, error: locError } = await supabase
      .from("inv_locations")
      .select("id, name")
      .in("id", locationIds);
    if (locError) return apiError("QUERY_ERROR", locError.message, 500);
    nameById = new Map((locs ?? []).map((l) => [l.id, l.name]));
  }

  const stock: StockSnapshot[] = rows.map(
    (row): StockSnapshot => ({
      product_id: row.product_id,
      variant_id: row.variant_id,
      location_id: row.location_id,
      location_name: nameById.get(row.location_id) ?? "",
      quantity: row.quantity,
      reserved: row.reserved,
      on_hand: row.quantity + row.reserved,
    })
  );

  const response: StockQueryResponse = { stock };
  return apiResponse(response);
}
