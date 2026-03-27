"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function createSupplier(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase.from("inv_suppliers").insert({
    org_id: user.id,
    ...parsed.data,
    email: parsed.data.email || null,
  });

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/suppliers");
  return { success: true };
}

export async function updateSupplier(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { error } = await supabase
    .from("inv_suppliers")
    .update({
      ...parsed.data,
      email: parsed.data.email || null,
    })
    .eq("id", id)
    .eq("org_id", user.id);

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/suppliers");
  return { success: true };
}

export async function deleteSupplier(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("inv_suppliers")
    .delete()
    .eq("id", id)
    .eq("org_id", user.id);

  revalidatePath("/suppliers");
}
