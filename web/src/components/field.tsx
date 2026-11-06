import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// 入力欄の見出し・説明・エラー（ui.md 4章）。エラーは欄の下に出す。
// 欄には id={htmlFor} と aria-invalid を付けること。
export function Field({
  label,
  htmlFor,
  error,
  description,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
