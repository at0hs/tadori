import type { AdminUser } from "@tadori/shared";

// S-13 の人数のカードと絞り込み（ui.md 6章）。
export const USER_STATUS_FILTERS = ["active", "must-change", "banned", "all"] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

function matchesStatus(user: AdminUser, status: UserStatusFilter): boolean {
  switch (status) {
    case "active":
      return !user.banned;
    case "must-change":
      return !user.banned && user.mustChangePassword;
    case "banned":
      return user.banned;
    case "all":
      return true;
  }
}

export function countByStatus(users: AdminUser[]): Record<UserStatusFilter, number> {
  return {
    active: users.filter((u) => matchesStatus(u, "active")).length,
    "must-change": users.filter((u) => matchesStatus(u, "must-change")).length,
    banned: users.filter((u) => matchesStatus(u, "banned")).length,
    all: users.length,
  };
}

/** q は前後の空白を除き、名前かユーザー名の部分一致。大文字と小文字は区別しない。並びは受け取った順。 */
export function filterUsers(
  users: AdminUser[],
  f: { status: UserStatusFilter; q: string },
): AdminUser[] {
  const q = f.q.trim().toLowerCase();
  return users.filter(
    (u) =>
      matchesStatus(u, f.status) &&
      (q === "" || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)),
  );
}
