/**
 * POST /api/v1/external-crm/reservations
 *
 * Reserve stock against a consumer quote. Atomic via inv_reserve_stock().
 *
 * Auth:   Bearer inv_…  (requires "reserve" permission)
 *
 * Body shape: see CreateReservationRequest in @/lib/external-crm-types.
 *
 * Idempotency: if the body includes `idempotency_key` and a reservation
 * already exists with that key for this org, the existing reservation is
 * returned (200) without creating a duplicate. Reuses of an idempotency
 * key that point to a different product/variant/location/qty are NOT
 * detected — consumers must keep the key 1:1 with the underlying intent.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import type { Reservation } from "@/lib/external-crm-types";

const createSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  reference: z.string().max(255).nullable().optional(),
  idempotency_key: z.string().min(1).max(255).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  // For POSTs there is no ?org_id= to cross-check; skip the param enforcement.
  const auth = await verifyExternalCrmKey(request, {
    required: "reserve",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; "),
      400
    );
  }

  const supabase = createAdminClient();

  const { data: reservationId, error } = await supabase.rpc(
    "inv_reserve_stock",
    {
      p_org_id: auth.orgId,
      p_product_id: parsed.data.product_id,
      p_variant_id: parsed.data.variant_id ?? null,
      p_location_id: parsed.data.location_id,
      p_quantity: parsed.data.quantity,
      p_reference: parsed.data.reference ?? null,
      p_idempotency_key: parsed.data.idempotency_key ?? null,
      p_expires_at: parsed.data.expires_at ?? null,
      p_notes: parsed.data.notes ?? null,
      p_performed_by: null,
      p_api_key_id: auth.keyId,
    }
  );

  if (error) {
    if (error.message.includes("insufficient_stock")) {
      return apiError(
        "INSUFFICIENT_STOCK",
        "Not enough available stock to satisfy this reservation",
        409
      );
    }
    if (error.message.includes("invalid_quantity")) {
      return apiError("VALIDATION_ERROR", error.message, 400);
    }
    return apiError("ADJUST_ERROR", error.message, 500);
  }

  if (!reservationId) {
    return apiError(
      "ADJUST_ERROR",
      "Reservation function returned no id",
      500
    );
  }

  // Read back the full reservation row to return a stable shape.
  const { data: reservation, error: fetchError } = await supabase
    .from("inv_reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (fetchError || !reservation) {
    return apiError(
      "QUERY_ERROR",
      fetchError?.message ?? "Failed to read back reservation",
      500
    );
  }

  // The DB row matches the consumer-facing Reservation type 1:1.
  return apiResponse(reservation satisfies Reservation, null, 201);
}
