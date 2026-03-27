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
  const search = searchParams.get("search");
  const category = searchParams.get("category");
  const status = searchParams.get("status") ?? "active";
  const barcode = searchParams.get("barcode");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const supabase = createAdminClient();

  let query = supabase
    .from("inv_products")
    .select("*, inv_categories(id, name)", { count: "exact" })
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status as "active" | "draft" | "archived");
  if (category) query = query.eq("category_id", category);
  if (barcode) query = query.eq("barcode", barcode);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`
    );
  }

  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;

  if (error) return apiError("QUERY_ERROR", error.message, 500);

  return apiResponse(data, {
    total: count,
    page,
    limit,
    pages: Math.ceil((count ?? 0) / limit),
  });
}
