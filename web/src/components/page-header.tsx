import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; to?: string };

// 画面の見出し（ui.md 2章）。左に太字の見出しと薄い説明、右に主な操作（1つまで）。
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumbs?: Breadcrumb[];
}) {
  return (
    <div>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav
      aria-label="パンくず"
      className="mb-1 flex items-center gap-1 text-sm text-muted-foreground"
    >
      {items.map((b, i) => (
        <span key={b.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {b.to ? (
            <Link to={b.to} className="transition-colors hover:text-foreground">
              {b.label}
            </Link>
          ) : (
            <span>{b.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
