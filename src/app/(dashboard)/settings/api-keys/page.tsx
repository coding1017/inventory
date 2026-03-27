"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";
import { Key, Plus, X, Copy, Check, Ban } from "lucide-react";
import type { ApiKey } from "@/lib/supabase/types";
import Badge from "@/components/ui/Badge";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("inv_api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    setKeys(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(formData: FormData) {
    const result = await createApiKey(formData);
    if (result?.error) {
      const errors = result.error as Record<string, string[]>;
      toast.error(Object.values(errors).flat()[0] || "Error");
      return;
    }
    if (result?.key) {
      setNewKey(result.key);
    }
    setShowForm(false);
    load();
  }

  async function handleRevoke(id: string) {
    await revokeApiKey(id);
    toast.success("API key revoked");
    load();
  }

  async function copyKey() {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="text-text-muted text-sm mt-1">
            Keys for external integrations (e-commerce sites, webhooks)
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setNewKey(null);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Key
        </button>
      </div>

      {/* New key display */}
      {newKey && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4">
          <p className="text-sm font-medium text-success mb-2">
            API Key Created
          </p>
          <p className="text-xs text-text-muted mb-2">
            Copy this key now. It won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-xs font-mono break-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="p-2 rounded-lg bg-surface hover:bg-surface2 transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-text-muted" />
              )}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-xs text-text-muted hover:text-text mt-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium">New API Key</h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-text-dim hover:text-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form action={handleCreate} className="space-y-3">
            <input
              name="name"
              placeholder="Key name (e.g. Wook Wear Integration)"
              required
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <select
              name="permissions"
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text"
            >
              <option value="read">Read only</option>
              <option value="read,adjust">Read + Adjust stock</option>
              <option value="read,write,adjust">Full access</option>
            </select>
            <input
              name="rate_limit"
              type="number"
              defaultValue={100}
              placeholder="Rate limit (req/min)"
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-text placeholder:text-text-dim"
            />
            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              Generate Key
            </button>
          </form>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <div className="text-text-dim text-sm text-center py-8">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <Key className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
          <p className="text-sm text-text-muted">No API keys yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {keys.map((key) => (
            <div key={key.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{key.name}</p>
                    <Badge variant={key.is_active ? "success" : "danger"}>
                      {key.is_active ? "Active" : "Revoked"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-xs text-text-dim font-mono">
                      {key.key_prefix}...
                    </code>
                    <span className="text-xs text-text-dim">
                      Permissions: {key.permissions.join(", ")}
                    </span>
                    <span className="text-xs text-text-dim">
                      Created{" "}
                      {format(new Date(key.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                {key.is_active && (
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/10 transition-colors"
                    title="Revoke key"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
