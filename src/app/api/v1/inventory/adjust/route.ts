import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, apiResponse, apiError, corsHeaders } from "@/lib/api-key";
import { z } from "zod";

const adjustSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  location_id: z.string().uuid(),
  type: z.enum(["sale", "return", "adjustment", "receive", "damaged"]),
  quantity: z.number().int(),
  reference: z.string().optional(),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const auth = await verifyApiKey(request, "adjust");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues.map((e) => `${e.path}: ${e.message}`).join(", "),
      400
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("inv_adjust_stock", {
    p_org_id: auth.orgId,
    p_product_id: parsed.data.product_id,
    p_variant_id: parsed.data.variant_id || null,
    p_location_id: parsed.data.location_id,
    p_type: parsed.data.type,
    p_quantity: parsed.data.quantity,
    p_reference: parsed.data.reference || null,
    p_notes: null,
    p_performed_by: null,
    p_api_key_id: auth.keyId,
  });

  if (error) {
    if (error.message.includes("insufficient_stock")) {
      return apiError("INSUFFICIENT_STOCK", "Not enough stock for this operation", 409);
    }
    return apiError("ADJUST_ERROR", error.message, 500);
  }

  // Get updated stock
  const { data: stock } = await supabase
    .from("inv_stock")
    .select("quantity, reserved")
    .eq("product_id", parsed.data.product_id)
    .eq("location_id", parsed.data.location_id)
    .single();

  return apiResponse(
    {
      movement_id: data,
      new_quantity: stock?.quantity ?? 0,
      reserved: stock?.reserved ?? 0,
    },
    null,
    200
  );
}
