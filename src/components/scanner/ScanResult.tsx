"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/supabase/types";
import Link from "next/link";
import { Package, Plus, ExternalLink } from "lucide-react";

export default function ScanResult({
  barcode,
  onClear,
}: {
  barcode: string;
  onClear: () => void;
}) {
  const [product, setProduct] = useState<Product | null>(null);
  const [stock, setStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function lookup() {
      setLoading(true);
      setNotFound(false);
      const supabase = createClient();

      // Check products
      const { data: prod } = await supabase
        .from("inv_products")
        .select("*")
        .eq("barcode", barcode)
        .single();

      if (prod) {
        setProduct(prod as any);
        // Get total stock
        const { data: stockData } = await supabase
          .from("inv_stock")
          .select("quantity")
          .eq("product_id", prod.id);

        const total =
          stockData?.reduce((sum: number, s: any) => sum + s.quantity, 0) ?? 0;
        setStock(total);
      } else {
        // Check variants
        const { data: variant } = await supabase
          .from("inv_product_variants")
          .select("*, inv_products(*)")
          .eq("barcode", barcode)
          .single();

        if (variant) {
          setProduct((variant as any).inv_products);
          const { data: stockData } = await supabase
            .from("inv_stock")
            .select("quantity")
            .eq("product_id", (variant as any).inv_products.id)
            .eq("variant_id", variant.id);

          const total =
            stockData?.reduce((sum: number, s: any) => sum + s.quantity, 0) ??
            0;
          setStock(total);
        } else {
          setNotFound(true);
        }
      }
      setLoading(false);
    }

    lookup();
  }, [barcode]);

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-text-muted">Looking up barcode...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="text-center">
          <p className="font-medium text-sm">Barcode not found</p>
          <p className="text-text-muted text-xs mt-1 font-mono">{barcode}</p>
          <div className="flex gap-2 justify-center mt-4">
            <Link
              href={`/products/new?barcode=${encodeURIComponent(barcode)}`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Product
            </Link>
            <button
              onClick={onClear}
              className="px-4 py-2 rounded-lg bg-surface2 hover:bg-border text-text-muted text-sm transition-colors"
            >
              Scan Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Package className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{product?.name}</p>
          <p className="text-xs text-text-dim font-mono">{product?.sku}</p>
          <div className="flex items-center gap-3 mt-2">
            <div className="text-center">
              <p
                className={`text-lg font-bold font-mono ${
                  stock !== null && stock <= (product?.low_stock_threshold ?? 5)
                    ? "text-danger"
                    : "text-success"
                }`}
              >
                {stock}
              </p>
              <p className="text-xs text-text-dim">In Stock</p>
            </div>
            {product?.sell_price && (
              <div className="text-center">
                <p className="text-lg font-bold font-mono">
                  ${Number(product.sell_price).toFixed(2)}
                </p>
                <p className="text-xs text-text-dim">Price</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Link
          href={`/products/${product?.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface2 hover:bg-border text-text-muted text-xs transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View Product
        </Link>
        <button
          onClick={onClear}
          className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs transition-colors"
        >
          Scan Again
        </button>
      </div>
    </div>
  );
}
