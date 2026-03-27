import {
  Package,
  AlertTriangle,
  TrendingUp,
  ArrowDownRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch summary stats
  const [productsRes, lowStockRes, movementsRes] = await Promise.all([
    supabase
      .from("inv_products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("inv_stock")
      .select("id, quantity, inv_products!inner(low_stock_threshold, name)")
      .lt("quantity", 0), // Will be refined after data exists
    supabase
      .from("inv_movements")
      .select("id", { count: "exact", head: true })
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      ),
  ]);

  const totalProducts = productsRes.count ?? 0;
  const lowStockCount = lowStockRes.data?.length ?? 0;
  const recentMovements = movementsRes.count ?? 0;

  const stats = [
    {
      label: "Active Products",
      value: totalProducts,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Low Stock Alerts",
      value: lowStockCount,
      icon: AlertTriangle,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Movements (7d)",
      value: recentMovements,
      icon: TrendingUp,
      color: "text-success",
      bg: "bg-success/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-text-muted text-sm mt-1">
          Inventory overview and recent activity
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface rounded-xl border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}
              >
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-text-muted text-xs">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent movements placeholder */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Recent Activity</h2>
        </div>
        <div className="p-8 text-center text-text-dim text-sm">
          <ArrowDownRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No recent movements yet.</p>
          <p className="mt-1">
            Start by adding products and adjusting stock levels.
          </p>
        </div>
      </div>
    </div>
  );
}
