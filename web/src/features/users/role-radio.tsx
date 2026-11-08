import { ROLES, type Role } from "@tadori/shared";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ROLE_DESCRIPTIONS, ROLE_ICONS, ROLE_LABELS } from "@/lib/roles.ts";
import { cn } from "@/lib/utils";

// ロールの選び方（ui.md 5.4、D-64）。S-14・S-15 で同じ部品を使う。
// 4つのロールを上のロールから縦に並べ、1つだけ選ぶ。各行の名前はロール名で始める。
export function RoleRadio({
  value,
  onChange,
  disabled,
  disabledReason,
  invalid,
  name,
  labelledBy,
}: {
  value: Role | undefined;
  onChange: (role: Role) => void;
  disabled?: boolean;
  disabledReason?: string;
  invalid?: boolean;
  name: string;
  /** 見出しの要素の id（選択肢のまとまりの名前） */
  labelledBy?: string;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        上のロールは、下のロールのできることをすべてできます。
      </p>
      <RadioGroup
        name={name}
        value={value ?? null}
        onValueChange={(v) => onChange(v as Role)}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-invalid={invalid || undefined}
        className="gap-0 overflow-hidden rounded-lg border"
      >
        {ROLES.map((role) => {
          const Icon = ROLE_ICONS[role];
          return (
            // biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem は中の button が欄になる
            <label
              key={role}
              className={cn(
                "flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 text-sm transition-colors last:border-b-0 has-data-checked:bg-accent/60",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroupItem value={role} aria-invalid={invalid || undefined} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
}
