import { createClient } from "@/lib/supabase/server";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import { PRODUCT_STATUSES } from "@/lib/constants";
import { Boxes } from "lucide-react";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("inv_products")
    .select("*, inv_categories(name)")
    .order("created_at", { ascending: false });

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,sku.ilike.%${params.search}%,barcode.ilike.%${params.search}%`
    );
  }
  if (params.status) {
    query = query.eq("status", params.status as "active" | "draft" | "archived");
  }
  if (params.category) {
    query = query.eq("category_id", params.category);
  }

  const page = parseInt(params.page ?? "1");
  const perPage = 25;
  query = query.range((page - 1) * perPage, page * perPage - 1);

  const { data: products } = await query;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage your product catalog"
        action={{ label: "Add Product", href: "/products/new", icon: Plus }}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
          <input
            name="search"
            defaultValue={params.search}
            placeholder="Search products by name, SKU, or barcode..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:border-primary transition-colors"
          />
        </form>

        <div className="flex gap-2">
          {(["active", "draft", "archived"] as const).map((status) => {
            const s = PRODUCT_STATUSES[status];
            const isActive = params.status === status;
            return (
              <Link
                key={status}
                href={
                  isActive
                    ? "/products"
                    : `/products?status=${status}${params.search ? `&search=${params.search}` : ""}`
                }
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? s.color
                    : "bg-surface border border-border text-text-muted hover:text-text"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Product list */}
      {!products || products.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No products yet"
          description="Create your first product to start managing inventory."
          action={{ label: "Add Product", href: "/products/new" }}
        />
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">
                  SKU
                </th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">
                  Category
                </th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">
                  Price
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product: any) => {
                const statusInfo =
                  PRODUCT_STATUSES[
                    product.status as keyof typeof PRODUCT_STATUSES
                  ];
                return (
                  <tr
                    key={product.id}
                    className="hover:bg-surface2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${product.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {product.name}
                      </Link>
                      {product.barcode && (
                        <p className="text-text-dim text-xs mt-0.5">
                          {product.barcode}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden sm:table-cell font-mono text-xs">
                      {product.sku}
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden md:table-cell">
                      {(product as any).inv_categories?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden lg:table-cell">
                      {product.sell_price
                        ? `$${Number(product.sell_price).toFixed(2)}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          product.status === "active"
                            ? "success"
                            : product.status === "draft"
                              ? "warning"
                              : "default"
                        }
                      >
                        {statusInfo?.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
