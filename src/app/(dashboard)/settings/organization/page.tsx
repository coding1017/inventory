"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createOrganization } from "@/actions/organizations";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

export default function OrganizationPage() {
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: membership } = await supabase
      .from("inv_org_members")
      .select("org_id, role, inv_organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (membership) {
      setHasOrg(true);
      setOrg((membership as any).inv_organizations);
    } else {
      setHasOrg(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(formData: FormData) {
    const result = await createOrganization(formData);
    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
    }
  }

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  if (loading) {
    return (
      <div className="text-text-dim text-sm text-center py-8">Loading...</div>
    );
  }

  if (hasOrg && org) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-xl font-semibold">Organization</h1>
          <p className="text-text-muted text-sm mt-1">
            Your organization details
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{org.name}</h2>
              <p className="text-text-muted text-sm">{org.slug}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md mx-auto mt-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/20 mb-4">
          <Building2 className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Create Your Organization</h1>
        <p className="text-text-muted text-sm mt-2">
          Set up your organization to start tracking inventory and inviting team
          members.
        </p>
      </div>

      <form action={handleCreate} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Organization Name
          </label>
          <input
            name="name"
            required
            placeholder="e.g. Wook Wear, VoltPro Electric"
            onChange={(e) => {
              const slugInput = document.querySelector(
                'input[name="slug"]'
              ) as HTMLInputElement;
              if (slugInput) slugInput.value = generateSlug(e.target.value);
            }}
            className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-text-dim text-sm focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">
            Slug (URL identifier)
          </label>
          <input
            name="slug"
            required
            placeholder="wook-wear"
            className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-text placeholder:text-text-dim text-sm font-mono focus:border-primary transition-colors"
          />
          <p className="text-text-dim text-xs mt-1">
            Lowercase letters, numbers, and hyphens only
          </p>
        </div>

        <button
          type="submit"
          className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        >
          Create Organization
        </button>
      </form>
    </div>
  );
}
