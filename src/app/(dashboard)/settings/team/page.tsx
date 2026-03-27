"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  inviteTeamMember,
  removeMember,
  updateMemberRole,
} from "@/actions/organizations";
import { Users, Plus, X, Shield, UserMinus, Crown, Mail } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  email?: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  accepted_at: string | null;
};

export default function TeamPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's active org
    const { data: membership } = await supabase
      .from("inv_org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) {
      setLoading(false);
      return;
    }

    setOrgId(membership.org_id);

    // Get all members
    const { data: membersData } = await supabase
      .from("inv_org_members")
      .select("*")
      .eq("org_id", membership.org_id)
      .eq("status", "active")
      .order("role")
      .order("created_at");

    setMembers(membersData ?? []);

    // Get pending invites
    const { data: invitesData } = await supabase
      .from("inv_invites")
      .select("*")
      .eq("org_id", membership.org_id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });

    setInvites(invitesData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleInvite(formData: FormData) {
    if (!orgId) return;
    formData.set("org_id", orgId);
    const result = await inviteTeamMember(formData);
    if (result?.error) {
      const errors = result.error as unknown as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
      return;
    }
    toast.success("Team member invited");
    setShowInvite(false);
    load();
  }

  async function handleRemove(memberId: string) {
    const result = await removeMember(memberId);
    if (result?.error) {
      toast.error(typeof result.error === "string" ? result.error : "Error");
      return;
    }
    toast.success("Member removed");
    load();
  }

  async function handleRoleChange(memberId: string, newRole: "admin" | "member") {
    const result = await updateMemberRole(memberId, newRole);
    if (result?.error) {
      toast.error(typeof result.error === "string" ? result.error : "Error");
      return;
    }
    toast.success("Role updated");
    load();
  }

  const roleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="w-3.5 h-3.5 text-warning" />;
      case "admin":
        return <Shield className="w-3.5 h-3.5 text-primary" />;
      default:
        return null;
    }
  };

  const roleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return <Badge variant="warning">Owner</Badge>;
      case "admin":
        return <Badge variant="info">Admin</Badge>;
      default:
        return <Badge>Member</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-text-muted text-sm mt-1">
            Manage who has access to this organization
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Invite
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">Invite Team Member</h2>
            <button
              onClick={() => setShowInvite(false)}
              className="text-text-dim hover:text-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={handleInvite} className="space-y-3">
            <input
              name="email"
              type="email"
              placeholder="Email address"
              required
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <select
              name="role"
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text"
            >
              <option value="member">Member — can view and adjust stock</option>
              <option value="admin">Admin — can manage products, team, and settings</option>
            </select>
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              Send Invite
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-text-dim text-sm text-center py-8">Loading...</div>
      ) : !orgId ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm font-medium">No organization yet</p>
          <p className="text-text-muted text-xs mt-1">
            Create an organization first from the dashboard.
          </p>
        </div>
      ) : (
        <>
          {/* Members list */}
          <div className="bg-surface rounded-xl border border-border divide-y divide-border">
            <div className="px-4 py-3">
              <h2 className="text-sm font-medium text-text-muted">
                Members ({members.length})
              </h2>
            </div>
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center">
                    {roleIcon(member.role) || (
                      <Users className="w-3.5 h-3.5 text-text-dim" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {member.email || member.user_id.slice(0, 8) + "..."}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {roleBadge(member.role)}
                    </div>
                  </div>
                </div>
                {member.role !== "owner" && (
                  <div className="flex gap-1">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(
                          member.id,
                          e.target.value as "admin" | "member"
                        )
                      }
                      className="px-2 py-1 rounded-md bg-bg border border-border text-xs text-text"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/10 transition-colors"
                      title="Remove member"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pending invites */}
          {invites.length > 0 && (
            <div className="bg-surface rounded-xl border border-border divide-y divide-border">
              <div className="px-4 py-3">
                <h2 className="text-sm font-medium text-text-muted">
                  Pending Invites ({invites.length})
                </h2>
              </div>
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-warning" />
                    </div>
                    <div>
                      <p className="text-sm">{invite.email}</p>
                      <Badge variant="warning">Pending</Badge>
                    </div>
                  </div>
                  <Badge>{invite.role}</Badge>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
