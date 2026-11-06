import { expect, type Page } from "@playwright/test";

// すべてダミー（playwright.config.ts の初期管理者と合わせる）
export const INITIAL_PASSWORD = "E2e-initial-passw0rd";
export const ADMIN_PASSWORD = "E2e-admin-passw0rd";
export const ADMIN_STATE = "e2e/.auth/admin.json";

export async function login(page: Page, username: string, password: string) {
  if (!new URL(page.url(), "http://x").pathname.startsWith("/login")) await page.goto("/login");
  await page.getByLabel("ユーザー名").fill(username);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** S-02 でパスワードを変える。 */
export async function changePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL("/account/password");
  await page.getByLabel("現在のパスワード").fill(current);
  await page.getByLabel("新しいパスワード", { exact: true }).fill(next);
  await page.getByLabel("新しいパスワード（確認）").fill(next);
  await page.getByRole("button", { name: "変更する" }).click();
}

/** 自分のメニューを開く。 */
export async function openUserMenu(page: Page) {
  await page.getByRole("button", { name: /自分のメニュー/ }).click();
}
