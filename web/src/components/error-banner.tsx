import { CircleAlert } from "lucide-react";
import { isApiError } from "@/lib/api.ts";

const DEFAULT_MESSAGE = "エラーが発生しました。時間をおいて試してください。";

// 画面全体のエラーの帯（ui.md 4章）。見出しの下に出す。
export function ErrorBanner({ error, message }: { error?: unknown; message?: string }) {
  if (!error && !message) return null;
  const text = message ?? (isApiError(error) ? error.message : DEFAULT_MESSAGE);
  return (
    <div
      role="alert"
      className="flex animate-in items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive duration-200 fade-in-0"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
