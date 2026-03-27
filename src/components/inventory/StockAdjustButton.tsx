"use client";

import { useState } from "react";
import { adjustStock } from "@/actions/inventory";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";

export default function StockAdjustButton({
  productId,
  variantId,
  locations,
  currentLocationId,
}: {
  productId: string;
  variantId?: string;
  locations: { id: string; name: string }[];
  currentLocationId?: string;
}) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(formData: FormData) {
    formData.set("product_id", productId);
    if (variantId) formData.set("variant_id", variantId);

    const result = await adjustStock(formData);
    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
      return;
    }

    toast.success("Stock adjusted");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-md text-text-dim hover:text-primary hover:bg-primary/10 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative bg-surface rounded-xl border border-border p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-sm">Adjust Stock</h3>
          <button onClick={() => setOpen(false)} className="text-text-dim hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={handleSubmit} className="space-y-3">
          <select
            name="type"
            required
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text"
          >
            <option value="receive">Receive (in)</option>
            <option value="sale">Sale (out)</option>
            <option value="adjustment">Manual Adjustment</option>
            <option value="return">Customer Return</option>
            <option value="damaged">Damaged/Write-off</option>
          </select>

          <select
            name="location_id"
            required
            defaultValue={currentLocationId}
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          <input
            name="quantity"
            type="number"
            required
            placeholder="Quantity (use negative for removals)"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
          />

          <input
            name="reference"
            placeholder="Reference (PO#, order ID...)"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
          />

          <input
            name="notes"
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
          />

          <button
            type="submit"
            className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
          >
            Submit Adjustment
          </button>
        </form>
      </div>
    </div>
  );
}
