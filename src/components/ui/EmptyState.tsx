import { type LucideIcon } from "lucide-react";
import Link from "next/link";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-12 text-center">
      <Icon className="w-10 h-10 mx-auto mb-3 text-text-dim opacity-40" />
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="text-text-muted text-sm mt-1 max-w-sm mx-auto">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
