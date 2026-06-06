/**
 * GET  /api/v1/external-crm/webhooks/subscriptions       list
 * POST /api/v1/external-crm/webhooks/subscriptions       create
 *
 * Both require Bearer + "webhooks_admin" permission. The "webhooks_admin"
 * permission is bundled with "reserve" by convention for the external CRM
 * use case (one key, one consumer team) — see INTEGRATION doc.
 *
 * Returns the plaintext `secret` exactly once, on create. The DB stores
 * plaintext so we can re-sign payloads; we just never re-display it on
 * GET responses (the GET handler strips it).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import { WEBHOOK_EVENTS } from "@/lib/webhook-publish";

const VALID_EVENTS = Object.values(WEBHOOK_EVENTS);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(1000),
  events: z
    .array(z.enum(VALID_EVENTS as [string, ...string[]]))
    .max(20)
    .optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const auth = await verifyExternalCrmKey(request, {
    required: "webhooks_admin",
    enforceOrgIdParam: false,
  });
  if (auth instanceof Response) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inv_webhook_subscriptions")
    .select(
      "id, org_id, name, url, events, is_active, last_delivered_at, last_failure_at, failure_streak, created_at, updated_at",
    )
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (error) return apiError("QUERY_ERROR", error.message, 500);
  return apiResponse(data ?? []);
}

export async function POST(request: NextRequest) {
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; "),
      400,
    );
  }

  // Mint a 32-byte hex secret (~256 bits)
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = `whsec_${Array.from(secretBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inv_webhook_subscriptions")
    .insert({
      org_id: auth.orgId,
      name: parsed.data.name,
      url: parsed.data.url,
      secret,
      events: parsed.data.events ?? [],
    })
    .select()
    .single();

  if (error) return apiError("QUERY_ERROR", error.message, 500);

  // Return secret in plaintext exactly once. Caller should persist it
  // immediately — subsequent GETs strip it.
  return apiResponse(data, null, 201);
}
