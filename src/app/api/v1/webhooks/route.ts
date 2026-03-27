import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, apiResponse, apiError, corsHeaders } from "@/lib/api-key";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Generic webhook endpoint for order events.
// Supports a simple format:
// { event: "order.paid", items: [{ product_id, variant_id?, quantity, location_id }], reference?: string }
export async function POST(request: NextRequest) {
  const auth = await verifyApiKey(request, "write");
  if (auth instanceof Response) return auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const event = body.event;
  if (!event) {
    return apiError("MISSING_EVENT", "Event type is required", 400);
  }

  // Handle order.paid: decrement stock for each item
  if (event === "order.paid") {
    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return apiError("MISSING_ITEMS", "Items array is required for order.paid", 400);
    }

    const supabase = createAdminClient();
    const results = [];

    for (const item of items) {
      if (!item.product_id || !item.location_id || !item.quantity) {
        results.push({ error: "Missing product_id, location_id, or quantity" });
        continue;
      }

      const { data, error } = await supabase.rpc("inv_adjust_stock", {
        p_org_id: auth.orgId,
        p_product_id: item.product_id,
        p_variant_id: item.variant_id || null,
        p_location_id: item.location_id,
        p_type: "sale",
        p_quantity: -Math.abs(item.quantity), // Always negative for sales
        p_reference: body.reference || null,
        p_notes: `Webhook: ${event}`,
        p_performed_by: null,
        p_api_key_id: auth.keyId,
      });

      if (error) {
        results.push({ product_id: item.product_id, error: error.message });
      } else {
        results.push({ product_id: item.product_id, movement_id: data });
      }
    }

    return apiResponse({ event, processed: results });
  }

  return apiError("UNKNOWN_EVENT", `Unsupported event type: ${event}`, 400);
}
