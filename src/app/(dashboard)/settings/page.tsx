import Link from "next/link";
import { Key, User } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-text-muted text-sm mt-1">
          Manage your account and integrations
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/settings/api-keys"
          className="flex items-center gap-4 bg-surface rounded-xl border border-border p-4 hover:border-border-hover transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">API Keys</p>
            <p className="text-text-muted text-xs mt-0.5">
              Manage keys for external integrations
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-4 bg-surface rounded-xl border border-border p-4 opacity-50">
          <div className="w-10 h-10 rounded-lg bg-surface2 flex items-center justify-center">
            <User className="w-5 h-5 text-text-dim" />
          </div>
          <div>
            <p className="font-medium text-sm">Account</p>
            <p className="text-text-muted text-xs mt-0.5">
              Profile and preferences (coming soon)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
