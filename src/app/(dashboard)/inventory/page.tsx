import { createClient } from "@/lib/supabase/server";
import { Package } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StockAdjustButton from "@/components/inventory/StockAdjustButton";

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: stockData } = await supabase
    .from("inv_stock")
    .select(
      "*, inv_products(id, name, sku, low_stock_threshold, status), inv_locations(id, name), inv_product_variants(id, name)"
    )
    .order("updated_at", { ascending: false });

  const { data: locations } = await supabase
    .from("inv_locations")
    .select("id, name")
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Current stock levels across all locations"
      />

      {!stockData || stockData.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock tracked yet"
          description="Add products and adjust stock to see levels here."
        />
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">
                  Variant
                </th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">
                  Reserved
                </th>
                <th className="px-4 py-3 font-medium text-right">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stockData.map((row: any) => {
                const product = row.inv_products;
                const isLow =
                  product &&
                  row.quantity <= product.low_stock_threshold;
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-surface2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{product?.name ?? "-"}</p>
                      <p className="text-xs text-text-dim font-mono">
                        {product?.sku}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden sm:table-cell">
                      {row.inv_product_variants?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden md:table-cell">
                      {row.inv_locations?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-mono font-medium ${
                          isLow ? "text-danger" : "text-text"
                        }`}
                      >
                        {row.quantity}
                      </span>
                      {isLow && (
                        <span className="text-danger text-xs ml-1">LOW</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text-muted hidden sm:table-cell font-mono">
                      {row.reserved}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StockAdjustButton
                        productId={product?.id}
                        variantId={row.inv_product_variants?.id}
                        locations={locations ?? []}
                        currentLocationId={row.inv_locations?.id}
                      />
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
