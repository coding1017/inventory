"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  description: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  barcode: z.string().optional(),
  barcode_type: z
    .enum(["ean13", "upc", "code128", "qr", "custom"])
    .optional(),
  unit: z.string().default("each"),
  cost_price: z.coerce.number().nullable().optional(),
  sell_price: z.coerce.number().nullable().optional(),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  low_stock_threshold: z.coerce.number().default(5),
  tags: z.string().optional(), // comma-separated
});

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { tags: tagsStr, ...data } = parsed.data;
  const tags = tagsStr
    ? tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const { error } = await supabase.from("inv_products").insert({
    org_id: user.id,
    ...data,
    category_id: data.category_id || null,
    supplier_id: data.supplier_id || null,
    barcode: data.barcode || null,
    barcode_type: data.barcode ? data.barcode_type || null : null,
    cost_price: data.cost_price ?? null,
    sell_price: data.sell_price ?? null,
    tags,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: { sku: ["SKU already exists"] } };
    }
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { tags: tagsStr, ...data } = parsed.data;
  const tags = tagsStr
    ? tagsStr
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const { error } = await supabase
    .from("inv_products")
    .update({
      ...data,
      category_id: data.category_id || null,
      supplier_id: data.supplier_id || null,
      barcode: data.barcode || null,
      barcode_type: data.barcode ? data.barcode_type || null : null,
      cost_price: data.cost_price ?? null,
      sell_price: data.sell_price ?? null,
      tags,
    })
    .eq("id", id)
    .eq("org_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: { sku: ["SKU already exists"] } };
    }
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

export async function archiveProduct(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("inv_products")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("org_id", user.id);

  revalidatePath("/products");
}

export async function restoreProduct(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("inv_products")
    .update({ status: "active" })
    .eq("id", id)
    .eq("org_id", user.id);

  revalidatePath("/products");
}
