import { type Browser, expect, type Page } from "@playwright/test";

// すべてダミー（playwright.config.ts の初期管理者と合わせる）
export const INITIAL_PASSWORD = "E2e-initial-passw0rd";
export const ADMIN_PASSWORD = "E2e-admin-passw0rd";
export const ADMIN_STATE = "e2e/.auth/admin.json";
// playwright.config.ts の WEB_PORT と合わせる
export const BASE_URL = "http://localhost:5174";

export async function login(page: Page, username: string, password: string) {
  if (!new URL(page.url(), "http://x").pathname.startsWith("/login")) await page.goto("/login");
  await page.getByLabel("ユーザー名", { exact: true }).fill(username);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
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

/** 別の人として操作するための、Cookie を持たない新しいページ。 */
export async function freshPage(browser: Browser): Promise<Page> {
  // test.use の storageState は browser.newContext() にも引き継がれるので、空を明示する
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "ja-JP",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/login");
  return page;
}

export const AUTHOR_STATES = ["e2e/.auth/author1.json", "e2e/.auth/author2.json"] as const;
const AUTHOR_TEMP_PASSWORD = "E2e-author-temp-passw0rd";
export const AUTHOR_PASSWORD = "E2e-author-passw0rd";

/**
 * 管理者の API で作成者を作り、1回ログインしてパスワードを変え、ログイン状態を保存する。
 * ログインは IP ごとに 60 秒 20 回までなので、ほかのテストはこの状態を使い回す。
 */
export async function setupAuthor(admin: Page, browser: Browser, index: 0 | 1) {
  const username = `author${index + 1}`;
  const res = await admin.request.post("/api/admin/users", {
    headers: { origin: BASE_URL },
    data: {
      name: `作成者 ${index === 0 ? "一郎" : "二郎"}`,
      username,
      email: `${username}@example.test`,
      password: AUTHOR_TEMP_PASSWORD,
      role: "approver",
    },
  });
  expect(res.status()).toBe(201);
  const page = await freshPage(browser);
  await login(page, username, AUTHOR_TEMP_PASSWORD);
  await firstPasswordChange(page, AUTHOR_TEMP_PASSWORD, AUTHOR_PASSWORD);
  await page.context().storageState({ path: AUTHOR_STATES[index] });
  await page.context().close();
}

/**
 * 初回のパスワード変更をしてホームに移るまで。Better Auth はパスワードの変更を IP ごとに
 * 10 秒 3 回までにしているので、ほかのファイルの変更と重なって断られたら、10 秒待ってやり直す。
 */
export async function firstPasswordChange(page: Page, current: string, next: string) {
  await changePassword(page, current, next);
  const limited = page.getByText("パスワードを変更できませんでした。");
  await expect(page.getByRole("heading", { name: "ホーム" }).or(limited)).toBeVisible();
  if (await limited.isVisible()) {
    await page.waitForTimeout(10_000);
    await page.getByRole("button", { name: "変更する" }).click();
  }
  await expect(page).toHaveURL("/");
}

/** 保存したログイン状態で、新しいページを開く。 */
export async function pageAs(browser: Browser, state: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "ja-JP",
    storageState: state,
  });
  return context.newPage();
}
