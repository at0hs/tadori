import type { AdminUser } from "@tadori/shared";
import { expect, test } from "vitest";
import { countByStatus, filterUsers } from "./filter.ts";

const u = (name: string, username: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id: crypto.randomUUID(),
  name,
  username,
  email: `${username}@example.test`,
  roles: [],
  banned: false,
  mustChangePassword: false,
  createdAt: "2026-11-07T00:00:00.000Z",
  ...o,
});

const users = [
  u("山田 太郎", "yamada"),
  u("佐藤 次郎", "sato", { mustChangePassword: true }),
  u("伊藤 六郎", "ito", { banned: true, mustChangePassword: true }),
];

test("数え方：変更が必要は有効な人だけ、無効は無効化された人", () => {
  expect(countByStatus(users)).toEqual({ active: 2, "must-change": 1, banned: 1, all: 3 });
});

test("状態で絞る", () => {
  expect(filterUsers(users, { status: "active", q: "" }).map((x) => x.username)).toEqual([
    "yamada",
    "sato",
  ]);
  expect(filterUsers(users, { status: "must-change", q: "" }).map((x) => x.username)).toEqual([
    "sato",
  ]);
  expect(filterUsers(users, { status: "banned", q: "" }).map((x) => x.username)).toEqual(["ito"]);
});

test("前後の空白と大文字を無視して、名前かユーザー名で探す", () => {
  expect(filterUsers(users, { status: "all", q: " YAMA " }).map((x) => x.username)).toEqual([
    "yamada",
  ]);
  expect(filterUsers(users, { status: "all", q: "佐藤" }).map((x) => x.username)).toEqual(["sato"]);
});
