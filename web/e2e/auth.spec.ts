import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_STATE, login, openUserMenu } from "./helpers.ts";

// F-01（S-01、S-02、共通の枠、S-16）と screens.md 8章の振り分け

test.describe("ログインしていない", () => {
  test("ログインに失敗すると、理由を区別せずに伝える", async ({ page }) => {
    await login(page, "admin", "wrong-password");
    await expect(page.getByText("ログインできませんでした")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("ログインの直後に自分の情報を取れなければ、そのことを伝える", async ({ page }) => {
    await page.goto("/login");
    await page.route("**/api/me", (route) => route.fulfill({ status: 500, body: "down" }));
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(
      page.getByText("ログインしましたが、画面を開けませんでした。時間をおいて試してください。"),
    ).toBeVisible();
  });

  test("ログイン前に開こうとした画面に、ログイン後に戻る", async ({ page }) => {
    await page.goto("/executions?card=running");
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL("/executions?card=running");
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
      await expect(
        page.getByRole("navigation", { name: "メニュー" }).getByRole("link", { name }),
      ).toBeVisible();
    }
    await openUserMenu(page);
    await expect(page.getByRole("menu").getByText("管理 花子")).toBeVisible();
    await expect(page.getByRole("menu").getByText("管理者")).toBeVisible();
  });

  test("操作の途中でセッションが切れたら、ログインし直して元の画面に戻る", async ({
    page,
    context,
  }) => {
    // ユーザーの作成の入力を終えてから切る（操作の途中で切れた場面にする）
    const form = "/admin/users/new";
    await page.goto(form);
    await page.getByLabel("名前", { exact: true }).fill("途中 切れ子");
    await page.getByLabel("ユーザー名", { exact: true }).fill("expired");
    await page.getByLabel("メールアドレス", { exact: true }).fill("expired@example.test");
    await page.getByLabel("仮のパスワード", { exact: true }).fill("Temp-passw0rd-09");
    await page.getByRole("radio", { name: /^閲覧者/ }).click();
    await context.clearCookies();
    await page.getByRole("button", { name: "作成する" }).click();
    await expect(page).toHaveURL(`/login?redirect=${encodeURIComponent(form)}`);
    await login(page, "admin", ADMIN_PASSWORD);
    await expect(page).toHaveURL(form);
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

  test("API が止まっていたら、日本語のエラー画面を出し、再読み込みで戻れる", async ({ page }) => {
    await page.route("**/api/me", (route) => route.fulfill({ status: 500, body: "down" }));
    await page.goto("/");
    await expect(page.getByText("画面を読み込めませんでした")).toBeVisible();
    await page.unroute("**/api/me");
    await page.getByRole("button", { name: "再読み込み" }).click();
    await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
  });

  test("存在しない URL は「見つかりません」", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText("ページが見つかりません")).toBeVisible();
  });
});
