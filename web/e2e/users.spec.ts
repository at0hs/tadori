import { expect, test } from "@playwright/test";
import { ADMIN_STATE, changePassword, freshPage, login, openUserMenu } from "./helpers.ts";

// F-01（S-13〜S-15）。上から順に状態を積む。
test.describe.configure({ mode: "serial" });
test.use({ storageState: ADMIN_STATE });

const TEMP_PASSWORD = "Temp-passw0rd-01";
const RESET_PASSWORD = "Temp-passw0rd-02";

test("ユーザーを作ると詳細に移り、作ったユーザーは初回ログインで変更を求められる", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "ユーザーを作成" }).click();
  await expect(page).toHaveURL("/admin/users/new");
  await page.getByLabel("名前", { exact: true }).fill("佐藤 次郎");
  await page.getByLabel("ユーザー名", { exact: true }).fill("sato");
  await page.getByLabel("メールアドレス", { exact: true }).fill("sato@example.test");
  await page.getByLabel("仮のパスワード", { exact: true }).fill(TEMP_PASSWORD);
  await page.getByRole("checkbox", { name: "実行者" }).check();
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "佐藤 次郎" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "実行者" })).toBeChecked();

  const other = await freshPage(browser);
  await login(other, "sato", TEMP_PASSWORD);
  await expect(other).toHaveURL("/account/password");
  await other.context().close();
});

test("送信中は「作成する」を押せない", async ({ page }) => {
  await page.goto("/admin/users/new");
  await page.getByLabel("名前", { exact: true }).fill("高橋 四郎");
  await page.getByLabel("ユーザー名", { exact: true }).fill("takahashi");
  await page.getByLabel("メールアドレス", { exact: true }).fill("takahashi@example.test");
  await page.getByLabel("仮のパスワード", { exact: true }).fill(TEMP_PASSWORD);
  // 応答を遅らせて、送信中の状態を確かめる
  await page.route("**/api/admin/users", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  const submit = page.getByRole("button", { name: "作成する" });
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
});

test("使われているユーザー名は欄にエラーを出し、入力を残す", async ({ page }) => {
  await page.goto("/admin/users/new");
  await page.getByLabel("名前", { exact: true }).fill("佐藤 二郎");
  await page.getByLabel("ユーザー名", { exact: true }).fill("sato");
  await page.getByLabel("メールアドレス", { exact: true }).fill("sato2@example.test");
  await page.getByLabel("仮のパスワード", { exact: true }).fill(TEMP_PASSWORD);
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page.getByText("このユーザー名は使われています。")).toBeVisible();
  await expect(page.getByLabel("名前", { exact: true })).toHaveValue("佐藤 二郎");
  await expect(page).toHaveURL("/admin/users/new");
});

test("一覧の人数のカードで絞り、URL に残る", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: /佐藤 次郎/ })).toBeVisible();
  await page.getByRole("button", { name: /パスワードの変更が必要/ }).click();
  await expect(page).toHaveURL(/status=must-change/);
  await expect(page.getByRole("link", { name: /佐藤 次郎/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /管理 花子/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("link", { name: /佐藤 次郎/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /管理 花子/ })).toHaveCount(0);
});

test("該当なしは0件の表示を出し、解除できる", async ({ page }) => {
  await page.goto("/admin/users?q=kimura");
  await expect(page.getByText("「kimura」に合うユーザーはいません")).toBeVisible();
  await page.getByRole("button", { name: "絞り込みを解除" }).click();
  await expect(page.getByRole("link", { name: /佐藤 次郎/ })).toBeVisible();
  await expect(page).not.toHaveURL(/q=/);
});

test("URL の絞り込みが外から変わったら、検索欄も合わせる", async ({ page }) => {
  await page.goto("/admin/users?q=sato");
  const search = page.getByRole("textbox", { name: "名前・ユーザー名で絞り込み" });
  await expect(search).toHaveValue("sato");
  await page
    .getByRole("navigation", { name: "メニュー" })
    .getByRole("link", { name: "管理" })
    .click();
  await expect(page).toHaveURL("/admin/users");
  await expect(search).toHaveValue("");
});

test("ロールのスイッチで付与と剥奪がすぐ反映される", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /佐藤 次郎/ }).click();
  const approver = page.getByRole("switch", { name: "承認者" });
  await approver.click();
  await expect(approver).toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: "承認者" })).toBeChecked();
  await page.getByRole("switch", { name: "承認者" }).click();
  await expect(page.getByRole("switch", { name: "承認者" })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: "承認者" })).not.toBeChecked();
});

test("自分に作成者ロールを付けると、ヘッダのロールがすぐ変わる", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /管理 花子/ }).click();
  await page.getByRole("switch", { name: "作成者" }).click();
  await expect(page.getByRole("switch", { name: "作成者" })).toBeChecked();
  await openUserMenu(page);
  await expect(page.getByRole("menu").getByText("管理者・作成者")).toBeVisible();
});

test("自分の詳細では管理者ロールを外せず、⋯ を出さない", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /管理 花子/ }).click();
  await expect(page.getByRole("switch", { name: "管理者" })).toBeDisabled();
  await expect(page.getByText("自分の管理者ロールは外せません")).toBeVisible();
  await expect(page.getByRole("button", { name: "その他の操作" })).toHaveCount(0);
});

test("パスワードを再設定すると、そのユーザーは次のログインで変更を求められる", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /佐藤 次郎/ }).click();
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "パスワードを再設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("仮のパスワード", { exact: true }).fill(RESET_PASSWORD);
  await dialog.getByRole("button", { name: "再設定する" }).click();
  await expect(dialog).toHaveCount(0);

  const other = await freshPage(browser);
  await login(other, "sato", RESET_PASSWORD);
  await expect(other).toHaveURL("/account/password");
  await other.context().close();
});

test("無効化すると、そのユーザーはログインできない", async ({ page, browser }) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /佐藤 次郎/ }).click();
  await page.getByRole("button", { name: "その他の操作" }).click();
  await page.getByRole("menuitem", { name: "無効化" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("佐藤 次郎 を無効化しますか？")).toBeVisible();
  await dialog.getByRole("button", { name: "無効化する" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("無効", { exact: true })).toBeVisible();

  const other = await freshPage(browser);
  await login(other, "sato", RESET_PASSWORD);
  await expect(other.getByText("ログインできませんでした")).toBeVisible();
  await other.context().close();
});

test("管理者でない人は管理の画面を開けず、メニューにも出ない", async ({ page, browser }) => {
  await page.goto("/admin/users/new");
  await page.getByLabel("名前", { exact: true }).fill("田中 五郎");
  await page.getByLabel("ユーザー名", { exact: true }).fill("tanaka");
  await page.getByLabel("メールアドレス", { exact: true }).fill("tanaka@example.test");
  await page.getByLabel("仮のパスワード", { exact: true }).fill(TEMP_PASSWORD);
  await page.getByRole("checkbox", { name: "実行者" }).check();
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);

  const other = await freshPage(browser);
  await login(other, "tanaka", TEMP_PASSWORD);
  await changePassword(other, TEMP_PASSWORD, "Tanaka-passw0rd-01");
  await expect(other).toHaveURL("/");
  await expect(
    other.getByRole("navigation", { name: "メニュー" }).getByRole("link", { name: "管理" }),
  ).toHaveCount(0);
  await other.goto("/admin/users");
  await expect(other.getByText("このページを開く権限がありません")).toBeVisible();
  await other.context().close();
});
