import { type LucideIcon } from "lucide-react";
import Link from "next/link";

export default function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; href: string; icon?: LucideIcon };
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && (
          <p className="text-text-muted text-sm mt-1">{description}</p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors flex-shrink-0"
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
        </Link>
      )}
    </div>
  );
}
