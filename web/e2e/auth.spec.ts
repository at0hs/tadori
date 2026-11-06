import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_STATE, login, openUserMenu } from "./helpers.ts";

// F-01（S-01、S-02、共通の枠、S-16）と screens.md 8章の振り分け

test.describe("ログインしていない", () => {
  test("ログインに失敗すると、理由を区別せずに伝える", async ({ page }) => {
    await login(page, "admin", "wrong-password");
    await expect(page.getByText("ログインできませんでした")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("ログイン前に開こうとした画面に、ログイン後に戻る", async ({ page }) => {
    await page.goto("/executions?status=running");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL("/executions?status=running");
  });

  test("redirect に外のサイトを入れても / に行く", async ({ page }) => {
    await page.goto("/login?redirect=//evil.example.test");
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL("/");
  });

  test("ログアウトするとログイン画面に移り、戻っても画面を見られない", async ({ page }) => {
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL("/");
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/procedures");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});

test.describe("ログインしている", () => {
  test.use({ storageState: ADMIN_STATE });

  test("ヘッダにメニューと自分の名前・ロールを出す", async ({ page }) => {
    await page.goto("/");
    for (const name of ["ホーム", "手順書", "実行", "管理"]) {
      await expect(page.getByRole("link", { name })).toBeVisible();
    }
    await openUserMenu(page);
    await expect(page.getByRole("menu").getByText("管理 花子")).toBeVisible();
    await expect(page.getByRole("menu").getByText("管理者")).toBeVisible();
  });

  // ユーザーの一覧（Task 4）ができたら fixme を外す
  test.fixme("セッションが切れたら、ログインし直して元の画面に戻る", async ({ page, context }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "ユーザー" })).toBeVisible();
    await context.clearCookies();
    // 画面のデータを取り直させる（タブに戻ったときの再取得と同じ）
    await page.getByRole("button", { name: /すべて/ }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fusers/);
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test("テーマをダークにすると、再読み込みしてもダークのまま", async ({ page }) => {
    await page.goto("/");
    await openUserMenu(page);
    await page.getByRole("button", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await openUserMenu(page);
    await page.getByRole("button", { name: "ライト" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("存在しない URL は「見つかりません」", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText("ページが見つかりません")).toBeVisible();
  });
});
