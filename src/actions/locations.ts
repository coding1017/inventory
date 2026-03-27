"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const locationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["warehouse", "store", "bin", "virtual"]),
  address: z.string().optional(),
  is_default: z.coerce.boolean().default(false),
});

export async function createLocation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  // If setting as default, unset other defaults first
  if (parsed.data.is_default) {
    await supabase
      .from("inv_locations")
      .update({ is_default: false })
      .eq("org_id", user.id)
      .eq("is_default", true);
  }

  const { error } = await supabase.from("inv_locations").insert({
    org_id: user.id,
    ...parsed.data,
  });

  if (error) {
    if (error.code === "23505") return { error: { name: ["Location name already exists"] } };
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/locations");
  return { success: true };
}

export async function updateLocation(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  if (parsed.data.is_default) {
    await supabase
      .from("inv_locations")
      .update({ is_default: false })
      .eq("org_id", user.id)
      .eq("is_default", true);
  }

  const { error } = await supabase
    .from("inv_locations")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", user.id);

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/locations");
  return { success: true };
}

export async function deleteLocation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("inv_locations")
    .delete()
    .eq("id", id)
    .eq("org_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/locations");
}
