import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { MOVEMENT_TYPES } from "@/lib/constants";
import { format } from "date-fns";
import { ArrowDownRight } from "lucide-react";

export default async function MovementsPage() {
  const supabase = await createClient();

  const { data: movements } = await supabase
    .from("inv_movements")
    .select(
      "*, inv_products(name, sku), inv_locations(name), inv_product_variants(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movement Log"
        description="Complete history of all stock changes"
      />

      {!movements || movements.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <ArrowDownRight className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm text-text-muted">No movements recorded yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">
                  Type
                </th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">
                  Location
                </th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">
                  Reference
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m: any) => {
                const typeInfo =
                  MOVEMENT_TYPES[
                    m.type as keyof typeof MOVEMENT_TYPES
                  ];
                return (
                  <tr
                    key={m.id}
                    className="hover:bg-surface2 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {m.inv_products?.name ?? "-"}
                      </p>
                      {m.inv_product_variants?.name && (
                        <p className="text-xs text-text-dim">
                          {m.inv_product_variants.name}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={typeInfo?.color}>
                        {typeInfo?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span
                        className={
                          m.quantity > 0 ? "text-success" : "text-danger"
                        }
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden md:table-cell">
                      {m.inv_locations?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-text-dim text-xs hidden lg:table-cell">
                      {m.reference ?? "-"}
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
