import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const ORG_COOKIE = "inv_active_org";

// Get the active organization for the current user
export async function getActiveOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Check for stored org preference
  const cookieStore = await cookies();
  const savedOrgId = cookieStore.get(ORG_COOKIE)?.value;

  if (savedOrgId) {
    // Verify user still has access to this org
    const { data: membership } = await supabase
      .from("inv_org_members")
      .select("org_id, role, inv_organizations(id, name, slug)")
      .eq("org_id", savedOrgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (membership) {
      return {
        orgId: membership.org_id,
        role: membership.role as "owner" | "admin" | "member",
        org: (membership as any).inv_organizations,
        userId: user.id,
      };
    }
  }

  // Fall back to first org the user belongs to
  const { data: membership } = await supabase
    .from("inv_org_members")
    .select("org_id, role, inv_organizations(id, name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .single();

  if (membership) {
    return {
      orgId: membership.org_id,
      role: membership.role as "owner" | "admin" | "member",
      org: (membership as any).inv_organizations,
      userId: user.id,
    };
  }

  // User has no org — they need to create one
  return { orgId: null, role: null, org: null, userId: user.id };
}

// Get all orgs the user belongs to (for org switcher)
export async function getUserOrgs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("inv_org_members")
    .select("org_id, role, inv_organizations(id, name, slug, logo_url)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at");

  return (data ?? []).map((m) => ({
    orgId: m.org_id,
    role: m.role,
    org: (m as any).inv_organizations,
  }));
}
