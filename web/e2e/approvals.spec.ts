import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, BASE_URL, changePassword, freshPage, login, pageAs } from "./helpers.ts";

// F-08（S-12 の承認・差し戻し・再依頼）。手順書は API で作って画面で公開し、
// 承認待ちの実行は API で用意する。
test.describe.configure({ mode: "serial" });

const TEMP_PASSWORD = "E2e-approval-temp-passw0rd";
const PASSWORD = "E2e-approval-passw0rd";
const USERS = {
  runner: { name: "依頼 四郎", username: "apprunner", role: "worker" },
  checker: { name: "承認 五郎", username: "checker1", role: "approver" },
} as const;
type Who = keyof typeof USERS;
const stateOf = (who: Who) => `e2e/.auth/${USERS[who].username}.json`;

let admin: Page;
const pages = {} as Record<Who, Page>;
let procedureId = "";
let approvedUrl = "";

/**
 * 管理者の API でユーザーを作り、初回のパスワード変更をしてログイン状態を保存する。
 * Better Auth はパスワードの変更を IP ごとに 10 秒 3 回までにしているので、
 * ほかのファイルの変更と重なって断られたら、10 秒待ってやり直す。
 */
async function setupUser(browser: Browser, who: Who) {
  const u = USERS[who];
  const res = await admin.request.post("/api/admin/users", {
    headers: { origin: BASE_URL },
    data: {
      name: u.name,
      username: u.username,
      email: `${u.username}@example.test`,
      password: TEMP_PASSWORD,
      role: u.role,
    },
  });
  expect(res.status()).toBe(201);
  const first = await freshPage(browser);
  await login(first, u.username, TEMP_PASSWORD);
  await changePassword(first, TEMP_PASSWORD, PASSWORD);
  const limited = first.getByText("パスワードを変更できませんでした。");
  await expect(first.getByRole("heading", { name: "ホーム" }).or(limited)).toBeVisible();
  if (await limited.isVisible()) {
    await first.waitForTimeout(10_000);
    await first.getByRole("button", { name: "変更する" }).click();
  }
  await expect(first).toHaveURL("/");
  await first.context().storageState({ path: stateOf(who) });
  await first.context().close();
  pages[who] = await pageAs(browser, stateOf(who));
  await pages[who].goto("/");
}

const post = (page: Page, path: string, data?: unknown) =>
  page.request.post(path, { headers: { origin: BASE_URL }, data });

/** API で開始し、手順を2つとも完了にして終了する（承認待ち）。S-12 の URL を返す */
async function finishedRun(page: Page): Promise<string> {
  const started = await post(page, "/api/executions", { procedureId, versionNo: 1, variables: {} });
  expect(started.status()).toBe(201);
  const { id } = await started.json();
  const detail = await (await page.request.get(`/api/executions/${id}`)).json();
  for (const s of detail.steps) {
    const res = await post(page, `/api/executions/${id}/steps/${s.stepId}/status-changes`, {
      from: "pending",
      to: "done",
      skipReason: null,
    });
    expect(res.status()).toBe(204);
  }
  expect((await post(page, `/api/executions/${id}/finish`)).status()).toBe(200);
  return `/executions/${id}`;
}

test.beforeAll(async ({ browser }) => {
  admin = await pageAs(browser, ADMIN_STATE);
  await admin.goto("/");
  for (const who of Object.keys(USERS) as Who[]) await setupUser(browser, who);
  // 2人目の承認者は管理者が兼ねる（管理者は承認者以上、D-64。新しいユーザーを作ると
  // パスワードの変更の回数制限にかかりやすいため）

  const runner = pages.runner;
  const step = (n: number, title: string) => ({
    id: `01970000-0000-7000-8000-0000000001a${n}`,
    title,
    description: "",
    command: `echo step${n}`,
    verification: "",
    evidenceRequired: false,
  });
  const created = await post(runner, "/api/procedures", {
    content: {
      title: "DNS レコードの更新",
      summary: "",
      tags: [],
      prerequisites: "",
      // 秘密変数は、再依頼のコメントのマスクを確かめるためだけに置く（どのステップも参照しない）
      variables: [{ name: "token", description: "トークン", default: null, secret: true }],
      steps: [step(1, "レコードを書き換える"), step(2, "名前解決を確かめる")],
      rollbackSteps: [],
    },
  });
  expect(created.status()).toBe(201);
  procedureId = (await created.json()).id;
  // 公開は承認者以上なので、作業者が作った下書きを管理者が公開する（D-65）
  await admin.goto(`/procedures/${procedureId}/edit`);
  await admin.getByRole("button", { name: "公開する" }).click();
  await admin.getByLabel("変更理由").fill("最初の版");
  await admin.getByRole("alertdialog").getByRole("button", { name: "公開する" }).click();
  await expect(admin).toHaveURL(`/procedures/${procedureId}`);
});

test.afterAll(async () => {
  for (const p of [admin, ...Object.values(pages)]) await p.context().close();
});

const band = (page: Page) => page.getByRole("status").or(page.getByRole("alert"));

test("F-08 AC: 自分の実行には承認・差し戻しのボタンが出ない", async () => {
  const { checker } = pages;
  await checker.goto(await finishedRun(checker));
  await expect(checker.getByText("承認待ち").first()).toBeVisible();
  await expect(checker.getByRole("button", { name: "承認する" })).toHaveCount(0);
  await expect(checker.getByRole("button", { name: "差し戻す" })).toHaveCount(0);
});

test("F-08: 差し戻し → 追記 → 再依頼 → 承認", async () => {
  const { runner, checker } = pages;
  const url = await finishedRun(runner);

  // 差し戻す（コメントは必須）
  await checker.goto(url);
  await checker.getByRole("button", { name: "差し戻す" }).click();
  const rejectDialog = checker.getByRole("alertdialog");
  await rejectDialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(rejectDialog.getByText("コメントを入力してください。")).toBeVisible();
  await rejectDialog.getByLabel("コメント").fill("手順 2 の結果を貼ってください");
  await rejectDialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(band(checker).filter({ hasText: "差し戻しました" })).toBeVisible();
  await expect(checker.getByText("手順 2 の結果を貼ってください")).toBeVisible();
  await expect(checker.getByRole("button", { name: "承認する" })).toHaveCount(0);

  // 本人は追記して再依頼する。状態は変えられない
  await runner.goto(url);
  await expect(runner.getByRole("group", { name: "手順 1の状態" })).toHaveCount(0);
  const card2 = runner.locator("#step-01970000-0000-7000-8000-0000000001a2");
  await card2.getByRole("button", { name: "コメント" }).click();
  await card2.getByRole("textbox").fill("dig の結果：192.0.2.10");
  await card2.getByRole("button", { name: "登録する" }).click();
  await expect(card2.getByText("dig の結果：192.0.2.10")).toBeVisible();
  await runner.getByRole("button", { name: "再依頼する" }).click();
  const resubmitDialog = runner.getByRole("alertdialog");
  await resubmitDialog.getByLabel("コメント").fill("手順 2 にコメントを足しました");
  await resubmitDialog.getByRole("button", { name: "再依頼する" }).click();
  await expect(band(runner).filter({ hasText: "承認待ちです" })).toBeVisible();
  await expect(runner.getByRole("button", { name: "再依頼する" })).toHaveCount(0);

  // 承認する
  await checker.goto(url);
  await checker.getByRole("button", { name: "承認する" }).click();
  await checker.getByRole("alertdialog").getByRole("button", { name: "承認する" }).click();
  await expect(band(checker).filter({ hasText: "承認しました" })).toBeVisible();
  await expect(checker.getByRole("button", { name: "承認する" })).toHaveCount(0);
  approvedUrl = url;
});

test("F-08 AC: 承認済みの実行には追記できない", async () => {
  const { runner } = pages;
  await runner.goto(approvedUrl);
  await expect(band(runner).filter({ hasText: "承認しました" })).toBeVisible();
  await expect(runner.getByRole("button", { name: "コメント" })).toHaveCount(0);
  await expect(runner.getByRole("button", { name: "エビデンス" })).toHaveCount(0);
  await expect(runner.getByRole("button", { name: "再依頼する" })).toHaveCount(0);
});

const XLSX_NAME = /^DNS レコードの更新_v1_\d{8}\.xlsx$/;

test("F-09: 承認者は見出しの「⋯」から Excel に出力できる", async () => {
  const { runner, checker } = pages;
  await checker.goto(await finishedRun(runner));
  await expect(checker.getByRole("button", { name: "承認する" })).toBeVisible();
  await checker.getByRole("button", { name: "その他の操作" }).click();
  const download = checker.waitForEvent("download");
  await checker.getByRole("menuitem", { name: "Excel に出力" }).click();
  expect((await download).suggestedFilename()).toMatch(XLSX_NAME);
  await expect(checker.getByRole("alert")).toHaveCount(0);
});

test("F-09: 承認済みの実行は枠線のボタンで出力できる", async () => {
  const { runner } = pages;
  await runner.goto(approvedUrl);
  const download = runner.waitForEvent("download");
  await runner.getByRole("button", { name: "Excel に出力" }).click();
  expect((await download).suggestedFilename()).toMatch(XLSX_NAME);
  await expect(runner.getByRole("alert")).toHaveCount(0);
});

test("先に別の人が承認していたら帯で知らせる", async () => {
  const { runner, checker } = pages;
  const url = await finishedRun(runner);
  await checker.goto(url);
  await expect(checker.getByRole("button", { name: "承認する" })).toBeVisible();
  expect((await post(admin, `/api${url}/approve`)).status()).toBe(204);

  await checker.getByRole("button", { name: "承認する" }).click();
  await checker.getByRole("alertdialog").getByRole("button", { name: "承認する" }).click();
  await expect(checker.getByRole("alert")).toBeVisible();
  await expect(checker.getByText("承認済み").first()).toBeVisible();
  await expect(checker.getByRole("button", { name: "承認する" })).toHaveCount(0);
});

const PROBLEM = "application/problem+json";

test("差し戻しの送信に失敗しても、入力したコメントは残る", async () => {
  const { runner, checker } = pages;
  const url = await finishedRun(runner);
  await checker.goto(url);
  await checker.getByRole("button", { name: "差し戻す" }).click();
  const dialog = checker.getByRole("alertdialog");
  await dialog.getByLabel("コメント").fill("長いコメント：手順 2 の結果を貼ってください");

  // サーバーのエラー：ダイアログを閉じず、中にエラーを出す
  await checker.route("**/api/executions/*/reject", (route) =>
    route.fulfill({
      status: 500,
      contentType: PROBLEM,
      body: JSON.stringify({ status: 500, code: "INTERNAL", title: "エラー" }),
    }),
  );
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("コメント")).toHaveValue(
    "長いコメント：手順 2 の結果を貼ってください",
  );

  // セッション切れ：ログイン画面へ移らず、ダイアログに残す
  await checker.unroute("**/api/executions/*/reject");
  await checker.route("**/api/executions/*/reject", (route) =>
    route.fulfill({
      status: 401,
      contentType: PROBLEM,
      body: JSON.stringify({
        status: 401,
        code: "UNAUTHENTICATED",
        title: "ログインしてください。",
      }),
    }),
  );
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(dialog.getByText("ログインの有効期限が切れました")).toBeVisible();
  await expect(checker).toHaveURL(url);
  await expect(dialog.getByLabel("コメント")).toHaveValue(
    "長いコメント：手順 2 の結果を貼ってください",
  );

  // 直れば、そのまま送れる
  await checker.unroute("**/api/executions/*/reject");
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(band(checker).filter({ hasText: "差し戻しました" })).toBeVisible();
});

test("再依頼のコメントの秘密変数の値は、承認の履歴でマスクして強調する", async () => {
  const { runner, checker } = pages;
  const url = await finishedRun(runner);
  expect(
    (await post(checker, `/api${url}/reject`, { comment: "トークンを確かめてください" })).status(),
  ).toBe(204);

  await runner.goto(url);
  await runner.getByRole("button", { name: "値を入力", exact: true }).click();
  await runner.getByLabel("#{token}").fill("Dummy-Token-9");
  await runner.getByRole("button", { name: "入力する" }).click();
  await runner.getByRole("button", { name: "再依頼する" }).click();
  await runner.getByRole("alertdialog").getByLabel("コメント").fill("token=Dummy-Token-9 で確認");
  await runner.getByRole("alertdialog").getByRole("button", { name: "再依頼する" }).click();

  const history = runner.getByRole("region", { name: "承認の履歴" });
  await expect(history.getByText("token=●●●● で確認")).toBeVisible();
  await expect(history.getByText("●●●●", { exact: true })).toHaveClass(/bg-warning/);
  await expect(history.getByText("Dummy-Token-9")).toHaveCount(0);
});
