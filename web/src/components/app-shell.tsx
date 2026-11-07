import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, KeyRound, LogOut, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import type { ReactNode } from "react";
import { AppLogo } from "@/components/app-logo.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clearSecrets } from "@/features/executions/secret-store.ts";
import { meQueryOptions } from "@/features/me/queries.ts";
import { authClient } from "@/lib/auth-client.ts";
import { visibleNavItems } from "@/lib/nav.ts";
import { ROLE_LABELS } from "@/lib/roles.ts";
import { type ThemePreference, useTheme } from "@/lib/theme.ts";

// 共通の枠（screens.md 2.1、ui.md 2章）。メニューの並べ方はここだけが決める。
export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const items = me.mustChangePassword ? [] : visibleNavItems(me.roles);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-chrome text-chrome-foreground">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-6">
          <AppLogo />
          <nav aria-label="メニュー" className="flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="relative flex h-12 items-center gap-1.5 px-3 text-sm text-chrome-foreground/75 transition-colors hover:text-chrome-foreground"
                activeProps={{
                  className:
                    "font-semibold !text-chrome-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-chrome-foreground",
                }}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <UserMenu name={me.name} roles={me.roles.map((r) => ROLE_LABELS[r]).join("・")} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
  { value: "system", label: "OS に合わせる", icon: Monitor },
];

function UserMenu({ name, roles }: { name: string; roles: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { preference, setPreference } = useTheme();

  const logout = async () => {
    await authClient.signOut();
    clearSecrets();
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="自分のメニュー"
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-chrome-foreground/50"
      >
        <span className="grid size-7 place-items-center rounded-full bg-white/20 text-xs font-semibold">
          {name.slice(0, 1)}
        </span>
        {name}
        <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {name.slice(0, 1)}
          </span>
          <div>
            <div className="font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{roles || "ロールなし"}</div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5 text-sm">
          <span className="flex items-center gap-2">
            <SunMoon className="size-4 text-muted-foreground" aria-hidden />
            テーマ
          </span>
          <ToggleGroup
            aria-label="テーマ"
            value={[preference]}
            onValueChange={(v) => {
              const next = v[0] as ThemePreference | undefined;
              if (next) setPreference(next);
            }}
            spacing={0}
            size="sm"
            className="rounded-md bg-muted p-0.5"
          >
            {THEME_OPTIONS.map((o) => (
              <ToggleGroupItem
                key={o.value}
                value={o.value}
                aria-label={o.label}
                title={o.label}
                className="h-6 rounded px-1.5 data-pressed:bg-card data-pressed:shadow-sm"
              >
                <o.icon className="size-3.5" aria-hidden />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/account/password" })}>
          <KeyRound className="text-muted-foreground" aria-hidden />
          パスワードの変更
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout}>
          <LogOut className="text-muted-foreground" aria-hidden />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
