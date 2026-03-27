import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyApiKey, apiResponse, apiError, corsHeaders } from "@/lib/api-key";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const auth = await verifyApiKey(request, "read");
  if (auth instanceof Response) return auth;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("inv_categories")
    .select("*")
    .eq("org_id", auth.orgId)
    .order("sort_order")
    .order("name");

  if (error) return apiError("QUERY_ERROR", error.message, 500);

  return apiResponse(data);
}
