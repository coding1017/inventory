"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const adjustSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  location_id: z.string().uuid(),
  type: z.enum([
    "receive",
    "sale",
    "adjustment",
    "transfer_in",
    "transfer_out",
    "return",
    "damaged",
    "reserved",
    "unreserved",
  ]),
  quantity: z.coerce.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function adjustStock(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const { data, error } = await supabase.rpc("inv_adjust_stock", {
    p_org_id: user.id,
    p_product_id: parsed.data.product_id,
    p_variant_id: parsed.data.variant_id || null,
    p_location_id: parsed.data.location_id,
    p_type: parsed.data.type,
    p_quantity: parsed.data.quantity,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
    p_performed_by: user.id,
    p_api_key_id: null,
  });

  if (error) {
    if (error.message.includes("insufficient_stock")) {
      return { error: { quantity: ["Insufficient stock for this operation"] } };
    }
    return { error: { _form: [error.message] } };
  }

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { success: true, movement_id: data };
}

export async function batchAdjustStock(
  items: Array<{
    product_id: string;
    variant_id?: string;
    location_id: string;
    type: string;
    quantity: number;
    reference?: string;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const results = [];
  for (const item of items) {
    const { data, error } = await supabase.rpc("inv_adjust_stock", {
      p_org_id: user.id,
      p_product_id: item.product_id,
      p_variant_id: item.variant_id || null,
      p_location_id: item.location_id,
      p_type: item.type,
      p_quantity: item.quantity,
      p_reference: item.reference || null,
      p_notes: null,
      p_performed_by: user.id,
      p_api_key_id: null,
    });

    if (error) {
      results.push({ product_id: item.product_id, error: error.message });
    } else {
      results.push({ product_id: item.product_id, movement_id: data });
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return results;
}
