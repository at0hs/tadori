import type { Role } from "@tadori/shared";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { app } from "../src/app.ts";
import { createUserAccount } from "../src/auth/users.ts";
import { db } from "../src/db/client.ts";
import { userRoles } from "../src/db/schema/users.ts";
import { logger } from "../src/lib/logger.ts";
import { TEST_ENV } from "./env.ts";

export const ORIGIN = new URL(TEST_ENV.APP_URL).origin;
export const PASSWORD = "Passw0rd-dummy-01";

/**
 * Better Auth はアプリのトランザクションに参加できない（conventions.md 4.4）ので、
 * 認証を使うテストはロールバックではなく、テーブルを空にして分ける。
 */
export async function resetDb() {
  await db.execute(
    sql`truncate table "user", session, account, verification, user_roles, procedures, procedure_versions, procedure_drafts cascade`,
  );
}

let ipSeq = 0;
/** テストごとに違う接続元にして、ログインの回数制限が他のテストに響かないようにする。 */
export function nextIp() {
  ipSeq += 1;
  return `192.0.2.${ipSeq % 250}`;
}

type RequestOptions = RequestInit & { ip?: string; cookie?: string; json?: unknown };

/**
 * app.request() で API を呼ぶ（D-11）。
 * 状態を変えるリクエストには Origin を付ける（D-61）。接続元の IP を Node のソケットの代わりに渡す。
 */
export function request(path: string, opts: RequestOptions = {}) {
  const { ip = nextIp(), cookie, json, ...init } = opts;
  const headers = new Headers(init.headers);
  const method = init.method ?? (json === undefined ? "GET" : "POST");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("origin")) {
    headers.set("origin", ORIGIN);
  }
  if (cookie) headers.set("cookie", cookie);
  if (json !== undefined) headers.set("content-type", "application/json");
  return app.request(
    path,
    { ...init, method, headers, body: json === undefined ? init.body : JSON.stringify(json) },
    { incoming: { socket: { remoteAddress: ip } } },
  );
}

export async function createUser(opts: {
  username: string;
  roles?: Role[];
  mustChangePassword?: boolean;
}) {
  const roles = opts.roles ?? [];
  const id = await createUserAccount({
    username: opts.username,
    name: `${opts.username} さん`,
    email: `${opts.username}@example.test`,
    password: PASSWORD,
    isAdmin: roles.includes("admin"),
    mustChangePassword: opts.mustChangePassword ?? false,
  });
  if (roles.length > 0) {
    await db.insert(userRoles).values(roles.map((role) => ({ userId: id, role })));
  }
  return id;
}

/** ログインしてセッションの Cookie を返す。 */
export async function login(username: string, password = PASSWORD) {
  const res = await request("/api/auth/sign-in/username", { json: { username, password } });
  if (res.status !== 200) throw new Error(`ログインに失敗した：${res.status} ${await res.text()}`);
  return cookieFrom(res);
}

export function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/**
 * 操作ログ（F-10）を集める。返した配列に、logger.info に渡した項目（event を持つもの）が入る。
 * vi.restoreAllMocks() か afterEach で元に戻すこと。
 */
export function captureOperationLogs() {
  const logs: Record<string, unknown>[] = [];
  vi.spyOn(logger, "info").mockImplementation(((obj: unknown, ...rest: unknown[]) => {
    if (typeof obj === "object" && obj !== null && "event" in obj) {
      logs.push({ ...(obj as Record<string, unknown>), msg: rest[0] });
    }
  }) as typeof logger.info);
  return logs;
}

/** user.role（admin プラグインの列）が、user_roles の管理者ロールの有無と食い違うユーザー（D-33）。 */
export async function adminColumnMismatches() {
  const result = await db.execute<{ id: string }>(sql`
    select u.id from "user" u
    where (u.role = 'admin') is distinct from exists (
      select 1 from user_roles r where r.user_id = u.id and r.role = 'admin'
    )
  `);
  return result.rows;
}

/** 応答の本文を読む。テストでは中身を自由に見たいので any にする。 */
// biome-ignore lint/suspicious/noExplicitAny: テストで応答の中身を見るため
export const readJson = (res: Response): Promise<any> => res.json();
