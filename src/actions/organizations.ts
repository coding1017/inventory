"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";

const orgSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
});

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  // Use admin client to bypass RLS for initial creation
  const admin = createAdminClient();

  // Create the org
  const { data: org, error: orgError } = await admin
    .from("inv_organizations")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      owner_id: user.id,
    })
    .select()
    .single();

  if (orgError) {
    if (orgError.code === "23505") return { error: { slug: ["This slug is already taken"] } };
    return { error: { _form: [orgError.message] } };
  }

  // Add the creator as owner
  await admin.from("inv_org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
    status: "active",
    joined_at: new Date().toISOString(),
  });

  // Set as active org
  const cookieStore = await cookies();
  cookieStore.set("inv_active_org", org.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function inviteTeamMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const email = formData.get("email") as string;
  const role = (formData.get("role") as string) || "member";
  const orgId = formData.get("org_id") as string;

  if (!email || !orgId) return { error: { email: ["Email is required"] } };

  // Verify caller is owner/admin of this org
  const { data: callerMembership } = await supabase
    .from("inv_org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
    return { error: { _form: ["You don't have permission to invite members"] } };
  }

  const admin = createAdminClient();

  // Check if user already exists in auth
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  if (existingUser) {
    // Check if already a member
    const { data: existing } = await admin
      .from("inv_org_members")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("user_id", existingUser.id)
      .single();

    if (existing?.status === "active") {
      return { error: { email: ["This user is already a member"] } };
    }

    if (existing) {
      // Reactivate removed member
      await admin
        .from("inv_org_members")
        .update({ status: "active", role: role as "admin" | "member", joined_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      // Add as member directly
      await admin.from("inv_org_members").insert({
        org_id: orgId,
        user_id: existingUser.id,
        role: role as "admin" | "member",
        invited_by: user.id,
        status: "active",
        joined_at: new Date().toISOString(),
      });
    }
  } else {
    // User doesn't exist yet — create invite token
    const token = crypto.randomUUID();

    const { error } = await admin.from("inv_invites").insert({
      org_id: orgId,
      email,
      role: role as "admin" | "member",
      invited_by: user.id,
      token,
    });

    if (error) {
      if (error.code === "23505") return { error: { email: ["This email has already been invited"] } };
      return { error: { _form: [error.message] } };
    }

    // TODO: Send invite email with link like:
    // https://inventory.webnari.io/signup?invite=TOKEN
  }

  revalidatePath("/settings/team");
  return { success: true };
}

export async function removeMember(memberId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get the member record to check org
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("inv_org_members")
    .select("org_id, user_id, role")
    .eq("id", memberId)
    .single();

  if (!member) return { error: "Member not found" };

  // Can't remove the owner
  if (member.role === "owner") return { error: "Cannot remove the organization owner" };

  // Verify caller is owner/admin
  const { data: callerMembership } = await supabase
    .from("inv_org_members")
    .select("role")
    .eq("org_id", member.org_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
    return { error: "You don't have permission to remove members" };
  }

  await admin
    .from("inv_org_members")
    .update({ status: "removed" })
    .eq("id", memberId);

  revalidatePath("/settings/team");
}

export async function updateMemberRole(memberId: string, newRole: "admin" | "member") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("inv_org_members")
    .select("org_id, role")
    .eq("id", memberId)
    .single();

  if (!member) return { error: "Member not found" };
  if (member.role === "owner") return { error: "Cannot change the owner's role" };

  // Verify caller is owner
  const { data: callerMembership } = await supabase
    .from("inv_org_members")
    .select("role")
    .eq("org_id", member.org_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!callerMembership || callerMembership.role !== "owner") {
    return { error: "Only the owner can change roles" };
  }

  await admin
    .from("inv_org_members")
    .update({ role: newRole })
    .eq("id", memberId);

  revalidatePath("/settings/team");
}

export async function switchOrganization(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set("inv_active_org", orgId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/");
  redirect("/dashboard");
}
