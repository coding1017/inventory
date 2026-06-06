/**
 * POST /api/v1/external-crm/reservations/[id]/release
 *
 * Release a reservation — quote declined / job cancelled / etc. Idempotent.
 *
 * Auth:   Bearer inv_…  (requires "reserve" permission)
 *
 * Body:   { notes?: string }
 *
 * Side effects:
 *   - movement: type=unreserved, qty=+N (no sale recorded)
 *   - inv_stock.reserved decremented by N
 *   - reservation row.status = 'released', release_movement_id linked
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import type { Reservation } from "@/lib/external-crm-types";
import { publishEvent, WEBHOOK_EVENTS } from "@/lib/webhook-publish";

const bodySchema = z.object({
  notes: z.string().max(1000).nullable().optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Next.js 16: params is a Promise — await it.
  const { id } = await context.params;

  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return apiError("VALIDATION_ERROR", "Reservation id must be a UUID", 400);
  }

  const auth = await verifyExternalCrmKey(request, {
    required: "reserve",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  let body: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
    }
  }

  const parsed = bodySchema.safeParse(body);
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

  const { error } = await supabase.rpc("inv_release_reservation", {
    p_reservation_id: id,
    p_org_id: auth.orgId,
    p_notes: parsed.data.notes ?? null,
    p_performed_by: null,
    p_api_key_id: auth.keyId,
  });

  if (error) {
    if (error.message.includes("reservation_not_found")) {
      return apiError(
        "RESERVATION_NOT_FOUND",
        "Reservation does not exist or belongs to a different org",
        404
      );
    }
    if (error.message.includes("reservation_not_active")) {
      return apiError("RESERVATION_NOT_ACTIVE", error.message, 409);
    }
    return apiError("ADJUST_ERROR", error.message, 500);
  }

  const { data: reservation, error: fetchError } = await supabase
    .from("inv_reservations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !reservation) {
    return apiError(
      "QUERY_ERROR",
      fetchError?.message ?? "Failed to read back reservation",
      500
    );
  }

  if (reservation.status === "released" && reservation.released_at) {
    publishEvent(supabase, {
      orgId: auth.orgId,
      event: WEBHOOK_EVENTS.RESERVATION_RELEASED,
      payload: {
        ...(reservation as unknown as Record<string, unknown>),
        release_notes: parsed.data.notes ?? null,
      },
    });
  }

  return apiResponse(reservation satisfies Reservation);
}
