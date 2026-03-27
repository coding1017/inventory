import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ProductForm from "@/components/products/ProductForm";
import PageHeader from "@/components/ui/PageHeader";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: product }, { data: categories }, { data: suppliers }] =
    await Promise.all([
      supabase.from("inv_products").select("*").eq("id", id).single(),
      supabase.from("inv_categories").select("*").order("name"),
      supabase.from("inv_suppliers").select("*").order("name"),
    ]);

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-text-muted hover:text-text text-sm mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Products
        </Link>
        <PageHeader
          title={product.name}
          description={`SKU: ${product.sku}`}
        />
      </div>
      <ProductForm
        product={product as any}
        categories={categories ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  );
}
