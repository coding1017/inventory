/**
 * POST /api/v1/external-crm/reservations/[id]/commit
 *
 * Convert a reservation into a real sale. Idempotent: re-committing an
 * already-committed reservation returns the existing row.
 *
 * Auth:   Bearer inv_…  (requires "reserve" permission)
 *
 * Body:   { reference?: string, notes?: string }   (all optional)
 *
 * Side effects:
 *   - movement 1: type=unreserved, qty=+N      (undoes the hold)
 *   - movement 2: type=sale,       qty=-N      (real sale, for COGS)
 *   - inv_stock.reserved decremented by N
 *   - reservation row.status = 'committed', commit_*_movement_id linked
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import type { Reservation } from "@/lib/external-crm-types";
import { publishEvent, WEBHOOK_EVENTS } from "@/lib/webhook-publish";

const bodySchema = z.object({
  reference: z.string().max(255).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Next.js 16: dynamic route params are async — must be awaited.
  const { id } = await context.params;

  // UUID guard before we hit the DB, so a bad path returns 400 not 500.
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return apiError("VALIDATION_ERROR", "Reservation id must be a UUID", 400);
  }

  const auth = await verifyExternalCrmKey(request, {
    required: "reserve",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  // Empty body is fine — both fields are optional.
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

  const { error } = await supabase.rpc("inv_commit_reservation", {
    p_reservation_id: id,
    p_org_id: auth.orgId,
    p_reference: parsed.data.reference ?? null,
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
      return apiError(
        "RESERVATION_NOT_ACTIVE",
        error.message,
        409
      );
    }
    return apiError("ADJUST_ERROR", error.message, 500);
  }

  // Read back the updated reservation.
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

  // Only fire the webhook if the reservation actually transitioned (not on
  // an idempotent re-commit of an already-committed row).
  if (reservation.status === "committed" && reservation.committed_at) {
    publishEvent(supabase, {
      orgId: auth.orgId,
      event: WEBHOOK_EVENTS.RESERVATION_COMMITTED,
      payload: {
        ...(reservation as unknown as Record<string, unknown>),
        invoice_reference: parsed.data.reference ?? null,
      },
    });
  }

  return apiResponse(reservation satisfies Reservation);
}
