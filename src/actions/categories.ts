"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  parent_id: z.string().optional(),
  sort_order: z.coerce.number().default(0),
});

export async function createCategory(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("inv_categories").insert({
    org_id: user.id,
    ...parsed.data,
    parent_id: parsed.data.parent_id || null,
  });

  if (error) {
    if (error.code === "23505") return { error: { slug: ["Slug already exists"] } };
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/categories");
  return { success: true };
}

export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("inv_categories")
    .update({
      ...parsed.data,
      parent_id: parsed.data.parent_id || null,
    })
    .eq("id", id)
    .eq("org_id", user.id);

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/categories");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("inv_categories")
    .delete()
    .eq("id", id)
    .eq("org_id", user.id);

  revalidatePath("/categories");
}
