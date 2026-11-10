import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, openUserMenu } from "./helpers.ts";

// 版の表示（D-69、ui.md 2章）。自分のメニューの「Tadori について」

const version = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

test.use({ storageState: ADMIN_STATE });

async function openAbout(page: Page) {
  await openUserMenu(page);
  await page.getByRole("menuitem", { name: /Tadori について/ }).click();
  return page.getByRole("dialog", { name: "Tadori について" });
}

test("メニューに「Tadori について」と版が出る", async ({ page }) => {
  await page.goto("/");
  await openUserMenu(page);
  const item = page.getByRole("menuitem", { name: /Tadori について/ });
  await expect(item).toBeVisible();
  await expect(item).toContainText(`v${version}`);
});

test("ダイアログに版・SHA・ライセンス・リンクが出る", async ({ page }) => {
  await page.goto("/");
  const dialog = await openAbout(page);
  await expect(dialog).toContainText(version);
  await expect(dialog.getByTestId("about-commit")).toHaveText(/^([0-9a-f]{7,}|unknown)$/);
  await expect(dialog).toContainText("MIT");
  const source = dialog.getByRole("link", { name: "github.com/at0hs/tadori" });
  await expect(source).toHaveAttribute("href", "https://github.com/at0hs/tadori");
  await expect(source).toHaveAttribute("target", "_blank");
  const licenses = dialog.getByRole("link", { name: /使っているライブラリのライセンス/ });
  await expect(licenses).toHaveAttribute("href", "/THIRD_PARTY_LICENSES.txt");
  await expect(licenses).toHaveAttribute("target", "_blank");
});

test("コピーすると「版 (SHA)」の形でクリップボードに入る", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const dialog = await openAbout(page);
  const commit = await dialog.getByTestId("about-commit").textContent();
  await dialog.getByRole("button", { name: "版とコミットをコピー" }).click();
  await expect(dialog.getByRole("button", { name: "コピーしました" })).toBeVisible();
  expect(await page.evaluate<string>("navigator.clipboard.readText()")).toBe(
    `${version} (${commit})`,
  );
});

test("一度取れなくても、ダイアログを開き直すと取り直す", async ({ page }) => {
  let failing = true;
  await page.route("**/api/version", (route) =>
    failing ? route.fulfill({ status: 500, body: "down" }) : route.continue(),
  );
  await page.goto("/");
  const dialog = await openAbout(page);
  await expect(dialog).toContainText("取得できませんでした");
  failing = false;
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const again = await openAbout(page);
  await expect(again.getByTestId("about-commit")).toHaveText(/^([0-9a-f]{7,}|unknown)$/);
});

test("HTTP（navigator.clipboard がない）でも、ダイアログの中からコピーできる", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // 安全でない接続と同じく navigator.clipboard を隠す。読み出しには元のものを取っておく
  // （e2e の型には DOM がないので、ブラウザで動かす部分は文字列で渡す）
  await page.addInitScript(
    "window.realClipboard = navigator.clipboard;" +
      "Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });",
  );
  await page.goto("/");
  const dialog = await openAbout(page);
  const commit = await dialog.getByTestId("about-commit").textContent();
  await dialog.getByRole("button", { name: "版とコミットをコピー" }).click();
  await expect(dialog.getByRole("button", { name: "コピーしました" })).toBeVisible();
  expect(await page.evaluate<string>("window.realClipboard.readText()")).toBe(
    `${version} (${commit})`,
  );
});

test("版を取れないときは、メニューに版を出さず、ダイアログで伝える", async ({ page }) => {
  await page.route("**/api/version", (route) => route.fulfill({ status: 500, body: "down" }));
  await page.goto("/");
  await openUserMenu(page);
  const item = page.getByRole("menuitem", { name: /Tadori について/ });
  await expect(item).toBeVisible();
  await expect(item).not.toContainText(/v\d/);
  await item.click();
  const dialog = page.getByRole("dialog", { name: "Tadori について" });
  await expect(dialog).toContainText("取得できませんでした");
  // 画面全体のエラーにはしない（閉じると元の画面のまま）
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /自分のメニュー/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("キーボードで開いて閉じると、自分のメニューのボタンにフォーカスが戻る", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /自分のメニュー/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const item = page.getByRole("menuitem", { name: /Tadori について/ });
  await item.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Tadori について" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
