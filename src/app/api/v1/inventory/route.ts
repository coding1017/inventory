import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, apiResponse, apiError, corsHeaders } from "@/lib/api-key";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const auth = await verifyApiKey(request, "read");
  if (auth instanceof Response) return auth;

  const { searchParams } = request.nextUrl;
  const productId = searchParams.get("product_id");
  const locationId = searchParams.get("location_id");
  const belowThreshold = searchParams.get("below_threshold") === "true";

  const supabase = createAdminClient();

  let query = supabase
    .from("inv_stock")
    .select(
      "*, inv_products(id, name, sku, low_stock_threshold), inv_locations(id, name), inv_product_variants(id, name)"
    )
    .eq("org_id", auth.orgId);

  if (productId) query = query.eq("product_id", productId);
  if (locationId) query = query.eq("location_id", locationId);

  const { data, error } = await query;

  if (error) return apiError("QUERY_ERROR", error.message, 500);

  let result = data ?? [];

  if (belowThreshold) {
    result = result.filter(
      (row: any) =>
        row.inv_products &&
        row.quantity <= row.inv_products.low_stock_threshold
    );
  }

  return apiResponse(result);
}
