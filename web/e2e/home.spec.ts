import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, BASE_URL, firstPasswordChange, freshPage, login, pageAs } from "./helpers.ts";

// S-03（ホーム）。手順書と実行は API で用意する。ほかのスペックの実行も DB に残るので、
// 承認待ちは件数の増減と、この実行の行の有無で確かめる。
test.describe.configure({ mode: "serial" });

const TEMP_PASSWORD = "E2e-home-temp-passw0rd";
const PASSWORD = "E2e-home-passw0rd";
const USERS = {
  runner: { name: "ホーム 六郎", username: "homerunner", roles: ["author", "executor"] },
  checker: { name: "ホーム 七子", username: "homechecker", roles: ["approver"] },
} as const;
type Who = keyof typeof USERS;
const stateOf = (who: Who) => `e2e/.auth/${USERS[who].username}.json`;
const TITLE = "ホームから開く手順";

let admin: Page;
const pages = {} as Record<Who, Page>;
let procedureId = "";

/** ユーザーを作って初回のパスワード変更をし、ログイン状態を保存する。 */
async function setupUser(browser: Browser, who: Who) {
  const u = USERS[who];
  const res = await admin.request.post("/api/admin/users", {
    headers: { origin: BASE_URL },
    data: {
      name: u.name,
      username: u.username,
      email: `${u.username}@example.test`,
      password: TEMP_PASSWORD,
      roles: u.roles,
    },
  });
  expect(res.status()).toBe(201);
  const first = await freshPage(browser);
  await login(first, u.username, TEMP_PASSWORD);
  await firstPasswordChange(first, TEMP_PASSWORD, PASSWORD);
  await first.context().storageState({ path: stateOf(who) });
  await first.context().close();
  pages[who] = await pageAs(browser, stateOf(who));
}

const post = (page: Page, path: string, data?: unknown) =>
  page.request.post(path, { headers: { origin: BASE_URL }, data });

/** API で実行を開始して ID を返す。finish なら手順をすべて完了にして終了する（承認待ち） */
async function run(page: Page, finish: boolean): Promise<string> {
  const started = await post(page, "/api/executions", { procedureId, versionNo: 1, variables: {} });
  expect(started.status()).toBe(201);
  const { id } = await started.json();
  if (finish) {
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
  }
  return id;
}

test.beforeAll(async ({ browser }) => {
  admin = await pageAs(browser, ADMIN_STATE);
  await admin.goto("/");
  for (const who of Object.keys(USERS) as Who[]) await setupUser(browser, who);

  const { runner } = pages;
  const created = await post(runner, "/api/procedures", {
    content: {
      title: TITLE,
      summary: "",
      tags: [],
      prerequisites: "",
      variables: [],
      steps: [
        {
          id: "01970000-0000-7000-8000-0000000003a1",
          title: "設定を確かめる",
          description: "",
          command: "echo check",
          verification: "",
          evidenceRequired: false,
        },
      ],
      rollbackSteps: [],
    },
  });
  expect(created.status()).toBe(201);
  procedureId = (await created.json()).id;
  await runner.goto(`/procedures/${procedureId}/edit`);
  await runner.getByRole("button", { name: "公開する" }).click();
  await runner.getByLabel("変更理由").fill("最初の版");
  await runner.getByRole("alertdialog").getByRole("button", { name: "公開する" }).click();
  await expect(runner).toHaveURL(`/procedures/${procedureId}`);
});

test.afterAll(async () => {
  for (const p of [admin, ...Object.values(pages)]) await p.context().close();
});

test("実行者は自分の実行中の実行をホームから開ける", async () => {
  const { runner } = pages;
  const id = await run(runner, false);
  await runner.goto("/");
  const mine = runner.getByRole("region", { name: "自分の実行" });
  await expect(mine.getByRole("heading", { name: "自分の実行" })).toBeVisible();
  // 承認者ロールがないので、承認待ちの区画は出ない
  await expect(runner.getByRole("region", { name: "承認待ち" })).toHaveCount(0);
  await mine
    .getByRole("link", { name: new RegExp(TITLE) })
    .first()
    .click();
  await expect(runner).toHaveURL(`/executions/${id}`);
});

test("自分の実行の「すべて見る」で、実行者で絞り込んだ実行の一覧に移る", async () => {
  const { runner } = pages;
  await runner.goto("/");
  await runner
    .getByRole("region", { name: "自分の実行" })
    .getByRole("link", { name: "すべて見る" })
    .click();
  await expect(runner).toHaveURL(/\/executions\?executor=/);
  await expect(runner.getByText(`実行者：${USERS.runner.name}`)).toBeVisible();
  await runner.getByRole("button", { name: "実行者の絞り込みを外す" }).click();
  await expect(runner).toHaveURL("/executions");
  await expect(runner.getByRole("button", { name: "実行者" })).toBeVisible();
});

test("承認すると承認待ちの区画から消える", async () => {
  const { runner, checker } = pages;
  const id = await run(runner, true);
  const row = (page: Page) =>
    page.getByRole("region", { name: "承認待ち" }).locator(`a[href="/executions/${id}"]`);

  await checker.goto("/");
  const pending = checker.getByRole("region", { name: "承認待ち" });
  await expect(pending.getByRole("heading", { name: "承認待ち" })).toBeVisible();
  const before = Number(await pending.locator('[data-slot="badge"]').first().textContent());
  expect(before).toBeGreaterThan(0);

  await checker.goto(`/executions/${id}`);
  await checker.getByRole("button", { name: "承認する" }).click();
  await checker.getByRole("alertdialog").getByRole("button", { name: "承認する" }).click();
  await expect(checker.getByRole("button", { name: "承認する" })).toHaveCount(0);

  await checker
    .getByRole("navigation", { name: "メニュー" })
    .getByRole("link", { name: "ホーム" })
    .click();
  await expect(pending.locator('[data-slot="badge"]').first()).toHaveText(String(before - 1));
  await expect(row(checker)).toHaveCount(0);
});

test("区画のロールがない人には一覧への案内を出す", async () => {
  await admin.goto("/");
  await expect(admin.getByText("手順書と実行は、それぞれの一覧から見られます")).toBeVisible();
  await admin.getByRole("link", { name: "実行の一覧" }).click();
  await expect(admin).toHaveURL("/executions");
});
