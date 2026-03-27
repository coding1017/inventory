import { createClient } from "@/lib/supabase/server";
import ProductForm from "@/components/products/ProductForm";
import PageHeader from "@/components/ui/PageHeader";

export default async function NewProductPage() {
  const supabase = await createClient();

  const [{ data: categories }, { data: suppliers }] = await Promise.all([
    supabase.from("inv_categories").select("*").order("name"),
    supabase.from("inv_suppliers").select("*").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="New Product" description="Add a new product to your catalog" />
      <ProductForm
        categories={categories ?? []}
        suppliers={suppliers ?? []}
      />
    </div>
  );
}
