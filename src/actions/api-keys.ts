"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  permissions: z.string().default("read"), // comma-separated
  rate_limit: z.coerce.number().default(100),
});

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `inv_${key}`;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createApiKey(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = apiKeySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const rawKey = generateApiKey();
  const keyHash = await hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const permissions = parsed.data.permissions
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const { error } = await supabase.from("inv_api_keys").insert({
    org_id: user.id,
    name: parsed.data.name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    permissions,
    rate_limit: parsed.data.rate_limit,
  });

  if (error) return { error: { _form: [error.message] } };

  revalidatePath("/settings/api-keys");
  // Return the raw key — this is the only time it's visible
  return { success: true, key: rawKey };
}

export async function revokeApiKey(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase
    .from("inv_api_keys")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", user.id);

  revalidatePath("/settings/api-keys");
}
