/**
 * External-CRM auth wrapper.
 *
 * Layers two checks on top of the existing verifyApiKey():
 *   1. Permission check (delegated)
 *   2. Per-key 1-minute sliding-window rate limit (inv_check_rate_limit)
 *
 * Also supports an optional ?org_id=… query param as a defence-in-depth
 * cross-check: API keys are already org-scoped, so a mismatched org_id
 * in the query string is a sign the caller has the wrong key (or is
 * actively probing). We surface it as 403 ORG_MISMATCH.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyApiKey,
  apiError,
  type AuthResult,
} from "@/lib/api-key";

export type ExternalAuthOptions = {
  /** Permission string the calling API key must hold (e.g. "read", "reserve"). */
  required: string;
  /**
   * If true (default), reads `?org_id=…` from the URL and 403s on mismatch
   * with the key's own org_id. Endpoints can pass false to skip the check.
   */
  enforceOrgIdParam?: boolean;
};

/**
 * Returns the authenticated key context, or a `NextResponse` that the route
 * handler should return directly. Mirrors the existing verifyApiKey
 * convention so call sites read uniformly.
 */
export async function verifyExternalCrmKey(
  request: NextRequest,
  options: ExternalAuthOptions
): Promise<AuthResult | NextResponse> {
  const auth = await verifyApiKey(request, options.required);
  if (auth instanceof NextResponse) return auth;

  // Optional org_id cross-check
  const enforce = options.enforceOrgIdParam ?? true;
  if (enforce) {
    const requestedOrgId = request.nextUrl.searchParams.get("org_id");
    if (requestedOrgId && requestedOrgId !== auth.orgId) {
      return apiError(
        "ORG_MISMATCH",
        "API key does not belong to the requested org_id",
        403
      );
    }
  }

  // Look up the key's rate_limit, then enforce.
  // We re-fetch here rather than threading it through verifyApiKey to keep
  // the upstream helper unchanged and avoid widening its return shape.
  const supabase = createAdminClient();
  const { data: keyRow } = await supabase
    .from("inv_api_keys")
    .select("rate_limit")
    .eq("id", auth.keyId)
    .single();

  const limit = keyRow?.rate_limit ?? 0;
  if (limit > 0) {
    const { data: allowed, error: limitError } = await supabase.rpc(
      "inv_check_rate_limit",
      { p_key_id: auth.keyId, p_limit: limit }
    );
    if (limitError) {
      // Fail open on rate-limit infrastructure errors (don't 500 a paying
      // consumer because our usage table hiccupped) but log loudly so it's
      // visible in Sentry / server logs.
      console.error("[external-crm] rate-limit check failed", limitError);
    } else if (allowed === false) {
      return NextResponse.json(
        {
          data: null,
          meta: null,
          error: {
            code: "RATE_LIMITED",
            message: `Rate limit of ${limit} requests/min exceeded for this API key`,
          },
        },
        {
          status: 429,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Retry-After": "60",
            "X-RateLimit-Limit": String(limit),
          },
        }
      );
    }
  }

  return auth;
}
