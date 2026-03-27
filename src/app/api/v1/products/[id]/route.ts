import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, apiResponse, apiError, corsHeaders } from "@/lib/api-key";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiKey(request, "read");
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: product }, { data: variants }, { data: stock }] =
    await Promise.all([
      supabase
        .from("inv_products")
        .select("*, inv_categories(id, name), inv_suppliers(id, name)")
        .eq("id", id)
        .eq("org_id", auth.orgId)
        .single(),
      supabase
        .from("inv_product_variants")
        .select("*")
        .eq("product_id", id)
        .eq("org_id", auth.orgId)
        .order("name"),
      supabase
        .from("inv_stock")
        .select("*, inv_locations(id, name)")
        .eq("product_id", id)
        .eq("org_id", auth.orgId),
    ]);

  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  return apiResponse({ ...product, variants: variants ?? [], stock: stock ?? [] });
}
