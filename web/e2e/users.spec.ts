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
  // ロールは既定で選ばれていない。選ばずに押すと欄にエラーを出す（ui.md 5.4）
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page.getByText("ロールを選んでください。")).toBeVisible();
  await expect(page).toHaveURL("/admin/users/new");
  await page.getByRole("radio", { name: /^作業者/ }).click();
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "佐藤 次郎" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^作業者/ })).toBeChecked();

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
  await page.getByRole("radio", { name: /^作業者/ }).click();
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
  await page.getByRole("radio", { name: /^作業者/ }).click();
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

test("ロールを選ぶとすぐ反映され、一覧にも出る（D-64）", async ({ page }) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /佐藤 次郎/ }).click();
  await page.getByRole("radio", { name: /^承認者/ }).click();
  await expect(page.getByRole("radio", { name: /^承認者/ })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio", { name: /^承認者/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^作業者/ })).not.toBeChecked();
  await page.goto("/admin/users");
  await expect(page.getByRole("link", { name: /佐藤 次郎/ }).getByText("承認者")).toBeVisible();
});

test("矢印キーで選んでいる途中のロールは送らず、グループから出たときに最後の1つだけを送る", async ({
  page,
}) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /佐藤 次郎/ }).click();
  const sent: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "PUT" && req.url().endsWith("/role")) sent.push(req.postData() ?? "");
  });
  // 承認者 → 作業者 → 閲覧者 と矢印キーで動かす
  await page.getByRole("radio", { name: /^承認者/ }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /^閲覧者/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^閲覧者/ })).toBeFocused();
  expect(sent).toEqual([]);

  await page.keyboard.press("Tab");
  await expect.poll(() => sent).toEqual([JSON.stringify({ role: "viewer" })]);
  await page.reload();
  await expect(page.getByRole("radio", { name: /^閲覧者/ })).toBeChecked();
});

test("自分の詳細ではロールを選べず、⋯ を出さない。ヘッダには自分のロールを出す（D-38）", async ({
  page,
}) => {
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /管理 花子/ }).click();
  for (const name of [/^管理者/, /^承認者/, /^作業者/, /^閲覧者/]) {
    await expect(page.getByRole("radio", { name })).toBeDisabled();
  }
  await expect(page.getByRole("radio", { name: /^管理者/ })).toBeChecked();
  await expect(page.getByText("自分のロールは変更できません")).toBeVisible();
  await expect(page.getByRole("button", { name: "その他の操作" })).toHaveCount(0);
  await openUserMenu(page);
  await expect(page.getByRole("menu").getByText("管理者", { exact: true })).toBeVisible();
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
  // 有効に戻す操作はないので、元に戻せないことを伝える（受入テスト P-2）
  await expect(dialog.getByText(/無効化は元に戻せません/)).toBeVisible();
  await dialog.getByRole("button", { name: "無効化する" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("無効", { exact: true })).toBeVisible();
  // 無効化したユーザーには、パスワードの再設定などの操作を出さない（受入テスト P-3）
  await expect(page.getByRole("button", { name: "その他の操作" })).toHaveCount(0);

  const other = await freshPage(browser);
  await login(other, "sato", RESET_PASSWORD);
  await expect(other.getByText("ログインできませんでした")).toBeVisible();
  await other.context().close();
});

test("管理者でない人（承認者でも）は管理の画面を開けず、メニューにも出ない", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/users/new");
  await page.getByLabel("名前", { exact: true }).fill("田中 五郎");
  await page.getByLabel("ユーザー名", { exact: true }).fill("tanaka");
  await page.getByLabel("メールアドレス", { exact: true }).fill("tanaka@example.test");
  await page.getByLabel("仮のパスワード", { exact: true }).fill(TEMP_PASSWORD);
  await page.getByRole("radio", { name: /^承認者/ }).click();
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
