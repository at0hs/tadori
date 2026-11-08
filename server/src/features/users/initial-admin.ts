import { count } from "drizzle-orm";
import { createUserAccount } from "../../auth/users.ts";
import type { Config } from "../../config.ts";
import { db } from "../../db/client.ts";
import { user } from "../../db/schema/auth.ts";
import { userRoles } from "../../db/schema/users.ts";
import { logger } from "../../lib/logger.ts";

type InitialAdminConfig = Pick<
  Config,
  | "INITIAL_ADMIN_USERNAME"
  | "INITIAL_ADMIN_NAME"
  | "INITIAL_ADMIN_EMAIL"
  | "INITIAL_ADMIN_PASSWORD"
  | "NODE_ENV"
>;

// .env.example のダミーの初期パスワード。公開されている値なので、本番ではこのまま管理者を作らない
// （正規の管理者より先に、同じネットワークの人がログインしてパスワードを変えられてしまう）。
const EXAMPLE_PASSWORD = "Initial-passw0rd-dummy";

/**
 * ユーザーが1人もいなければ、.env の値で初期管理者を作る（D-20、authorization.md 4.3）。
 * 「パスワード変更が必要」にして、最初のログインで変更させる（D-14）。
 */
export async function ensureInitialAdmin(cfg: InitialAdminConfig): Promise<"created" | "skipped"> {
  const [row] = await db.select({ n: count() }).from(user);
  if ((row?.n ?? 0) > 0) return "skipped";

  const username = cfg.INITIAL_ADMIN_USERNAME;
  const name = cfg.INITIAL_ADMIN_NAME;
  const email = cfg.INITIAL_ADMIN_EMAIL;
  const password = cfg.INITIAL_ADMIN_PASSWORD;
  if (!username || !name || !email || !password) {
    throw new Error(
      "ユーザーがいないため初期管理者を作るが、INITIAL_ADMIN_USERNAME・INITIAL_ADMIN_NAME・INITIAL_ADMIN_EMAIL・INITIAL_ADMIN_PASSWORD のどれかがない",
    );
  }

  if (cfg.NODE_ENV === "production" && password === EXAMPLE_PASSWORD) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD が .env.example のダミーの値のままです。別の値にしてください",
    );
  }

  // Better Auth で作った後に、アプリの側でロールを登録する（conventions.md 4.4）。
  const id = await createUserAccount({
    username,
    name,
    email,
    password,
    isAdmin: true,
    mustChangePassword: true,
  });
  // 最後にロールを設定した人は本人にする（data-model.md 4.1）
  await db.insert(userRoles).values({ userId: id, role: "admin", updatedBy: id });

  logger.info(
    { event: "user.created", target: { type: "user", id }, initialAdmin: true },
    "初期管理者を作成した",
  );
  return "created";
}
