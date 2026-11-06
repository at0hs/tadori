import { Footprints } from "lucide-react";

// ロゴの置き場（ui.md 2章）。今は仮のアイコン。後で SVG に差し替える。
export function AppLogo({ size = "default" }: { size?: "default" | "lg" }) {
  if (size === "lg") {
    return (
      <span className="grid size-12 place-items-center rounded-xl bg-chrome text-chrome-foreground">
        <Footprints className="size-6" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-white/15">
        <Footprints className="size-4" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-wide">Tadori</span>
    </span>
  );
}
