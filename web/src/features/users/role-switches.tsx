import { type AdminUser, ROLES, type Role } from "@tadori/shared";
import { ErrorBanner } from "@/components/error-banner.tsx";
import { Switch } from "@/components/ui/switch";
import { ROLE_ICONS, ROLE_LABELS } from "@/lib/roles.ts";
import { useSetRole } from "./queries.ts";

// ロールの付与・剥奪（screens.md の S-15）。1つずつ切り替え、押したらすぐ反映する。
// 自分の管理者ロールは外せない（D-38）。
export function RoleSwitches({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const setRole = useSetRole(user.id, isSelf);
  const pendingRole = setRole.isPending ? setRole.variables?.role : undefined;

  const checked = (role: Role) =>
    pendingRole === role ? (setRole.variables?.on ?? false) : user.roles.includes(role);

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">ロール</h2>
      <p className="text-xs text-muted-foreground">切り替えるとすぐに反映します</p>
      {setRole.error && (
        <div className="mt-3">
          <ErrorBanner error={setRole.error} />
        </div>
      )}
      <ul className="mt-3 divide-y">
        {ROLES.map((role) => {
          const Icon = ROLE_ICONS[role];
          const locked = isSelf && role === "admin";
          return (
            <li key={role} className="py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  {ROLE_LABELS[role]}
                </span>
                <Switch
                  aria-label={ROLE_LABELS[role]}
                  checked={checked(role)}
                  disabled={locked || setRole.isPending}
                  onCheckedChange={(on) => setRole.mutate({ role, on })}
                />
              </div>
              {locked && (
                <p className="mt-1 text-xs text-muted-foreground">自分の管理者ロールは外せません</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
