/**
 * PATCH  /api/v1/external-crm/webhooks/subscriptions/[id]   update / toggle
 * DELETE /api/v1/external-crm/webhooks/subscriptions/[id]   delete
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import { WEBHOOK_EVENTS } from "@/lib/webhook-publish";

const VALID_EVENTS = Object.values(WEBHOOK_EVENTS);

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    url: z.string().url().max(1000).optional(),
    events: z
      .array(z.enum(VALID_EVENTS as [string, ...string[]]))
      .max(20)
      .optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("VALIDATION_ERROR", "Subscription id must be a UUID", 400);
  }
  const auth = await verifyExternalCrmKey(request, {
    required: "webhooks_admin",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      400,
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inv_webhook_subscriptions")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", auth.orgId)
    .select(
      "id, org_id, name, url, events, is_active, last_delivered_at, last_failure_at, failure_streak, created_at, updated_at",
    )
    .single();
  if (error) return apiError("QUERY_ERROR", error.message, 500);
  if (!data) return apiError("QUERY_ERROR", "Subscription not found", 404);
  return apiResponse(data);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("VALIDATION_ERROR", "Subscription id must be a UUID", 400);
  }
  const auth = await verifyExternalCrmKey(request, {
    required: "webhooks_admin",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inv_webhook_subscriptions")
    .delete()
    .eq("id", id)
    .eq("org_id", auth.orgId);
  if (error) return apiError("QUERY_ERROR", error.message, 500);
  return apiResponse({ deleted: true });
}
