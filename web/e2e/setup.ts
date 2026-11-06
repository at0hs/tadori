import { expect, test as setup } from "@playwright/test";
import { ADMIN_PASSWORD, ADMIN_STATE, changePassword, INITIAL_PASSWORD, login } from "./helpers.ts";

// F-01 AC：初期管理者には初回ログイン時にパスワードを変更させる。
// ここで変えた管理者のログイン状態を、ほかのテストが使い回す（ログインの回数制限があるため）。
setup(
  "初期管理者は初回ログインでパスワードの変更に移され、変えるとホームに移る",
  async ({ page }) => {
    await login(page, "admin", INITIAL_PASSWORD);
    await expect(page).toHaveURL("/account/password");
    await expect(page.getByText("パスワードの変更が必要です")).toBeVisible();
    // 変更が済むまではメニューを出さず、ほかの画面にも行けない
    await expect(page.getByRole("link", { name: "手順書" })).toHaveCount(0);
    await page.goto("/procedures");
    await expect(page).toHaveURL("/account/password");

    // 確認の入力が合わなければ送らない
    await page.getByLabel("現在のパスワード").fill(INITIAL_PASSWORD);
    await page.getByLabel("新しいパスワード", { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByLabel("新しいパスワード（確認）").fill("Different-passw0rd");
    await page.getByRole("button", { name: "変更する" }).click();
    await expect(page.getByText("新しいパスワードと一致しません")).toBeVisible();
    await expect(page).toHaveURL("/account/password");

    await changePassword(page, INITIAL_PASSWORD, ADMIN_PASSWORD);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "管理" })).toBeVisible();

    await page.context().storageState({ path: ADMIN_STATE });
  },
);
