/**
 * GET /api/v1/external-crm/products/lookup?sku=…&barcode=…&org_id=…&location_id=…
 *
 * Fast product lookup for an external CRM building a quote. Returns
 * product + active variants + per-location stock snapshot.
 *
 * Auth:   Bearer inv_…  (requires "read" permission)
 * Either sku OR barcode must be provided. If both are provided, sku wins.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiResponse,
  apiError,
  corsHeaders,
} from "@/lib/api-key";
import { verifyExternalCrmKey } from "@/lib/external-crm-auth";
import type {
  ProductLookupResponse,
  StockSnapshot,
} from "@/lib/external-crm-types";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const auth = await verifyExternalCrmKey(request, { required: "read" });
  if (auth instanceof Response) return auth;

  const { searchParams } = request.nextUrl;
  const sku = searchParams.get("sku");
  const barcode = searchParams.get("barcode");
  const locationId = searchParams.get("location_id");

  if (!sku && !barcode) {
    return apiError(
      "VALIDATION_ERROR",
      "One of ?sku= or ?barcode= is required",
      400
    );
  }

  const supabase = createAdminClient();

  // Look up the product by sku first (more specific), fall back to barcode.
  let productQuery = supabase
    .from("inv_products")
    .select(
      "id, org_id, sku, name, description, barcode, barcode_type, unit, cost_price, sell_price, images, tags, status, category_id, supplier_id"
    )
    .eq("org_id", auth.orgId)
    .limit(1);

  if (sku) productQuery = productQuery.eq("sku", sku);
  else if (barcode) productQuery = productQuery.eq("barcode", barcode);

  const { data: products, error: productError } = await productQuery;
  if (productError) return apiError("QUERY_ERROR", productError.message, 500);
  if (!products || products.length === 0) {
    return apiError(
      "PRODUCT_NOT_FOUND",
      sku
        ? `No product with sku=${sku}`
        : `No product with barcode=${barcode}`,
      404
    );
  }

  const product = products[0];

  // Pull active variants in parallel with stock.
  const variantsPromise = supabase
    .from("inv_product_variants")
    .select(
      "id, sku, name, barcode, attributes, cost_price, sell_price"
    )
    .eq("org_id", auth.orgId)
    .eq("product_id", product.id)
    .eq("status", "active");

  let stockQuery = supabase
    .from("inv_stock")
    .select("product_id, variant_id, location_id, quantity, reserved")
    .eq("org_id", auth.orgId)
    .eq("product_id", product.id);
  if (locationId) stockQuery = stockQuery.eq("location_id", locationId);

  const [variantsRes, stockRes] = await Promise.all([
    variantsPromise,
    stockQuery,
  ]);

  if (variantsRes.error)
    return apiError("QUERY_ERROR", variantsRes.error.message, 500);
  if (stockRes.error)
    return apiError("QUERY_ERROR", stockRes.error.message, 500);

  // Resolve location names with a single IN query — typed-client FK joins
  // need explicit Relationships in @/lib/supabase/types.ts which we keep
  // empty for the inv_* tables.
  const stockRows = stockRes.data ?? [];
  const locationIds = Array.from(new Set(stockRows.map((r) => r.location_id)));
  let nameById = new Map<string, string>();
  if (locationIds.length > 0) {
    const { data: locs, error: locError } = await supabase
      .from("inv_locations")
      .select("id, name")
      .in("id", locationIds);
    if (locError) return apiError("QUERY_ERROR", locError.message, 500);
    nameById = new Map((locs ?? []).map((l) => [l.id, l.name]));
  }

  const stock: StockSnapshot[] = stockRows.map(
    (row): StockSnapshot => ({
      product_id: row.product_id,
      variant_id: row.variant_id,
      location_id: row.location_id,
      location_name: nameById.get(row.location_id) ?? "",
      quantity: row.quantity,
      reserved: row.reserved,
      on_hand: row.quantity + row.reserved,
    })
  );

  const response: ProductLookupResponse = {
    product,
    variants: variantsRes.data ?? [],
    stock,
  };

  return apiResponse(response);
}
