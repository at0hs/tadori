import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, BASE_URL, changePassword, freshPage, login, pageAs } from "./helpers.ts";

// F-04〜F-06（S-10〜S-12、S-11、S-15）。手順書は API で作って画面で公開しておく。
test.describe.configure({ mode: "serial" });

const RUNNER_STATE = "e2e/.auth/runner.json";
const RUNNER_TEMP_PASSWORD = "E2e-runner-temp-passw0rd";
const RUNNER_PASSWORD = "E2e-runner-passw0rd";
const SECRET = "Dummy-Pass-123";
const PERMISSIONS = ["clipboard-read", "clipboard-write"];

let admin: Page;
let runner: Page;
let runnerId = "";
let procedureId = "";

/** クリップボードを読める、実行者（作成者も兼ねる）のページ */
async function runnerPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "ja-JP",
    storageState: RUNNER_STATE,
    permissions: PERMISSIONS,
  });
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  admin = await pageAs(browser, ADMIN_STATE);
  await admin.goto("/");
  const res = await admin.request.post("/api/admin/users", {
    headers: { origin: BASE_URL },
    data: {
      name: "実行 三郎",
      username: "runner1",
      email: "runner1@example.test",
      password: RUNNER_TEMP_PASSWORD,
      role: "worker",
    },
  });
  expect(res.status()).toBe(201);
  runnerId = (await res.json()).id;
  const first = await freshPage(browser);
  await login(first, "runner1", RUNNER_TEMP_PASSWORD);
  await changePassword(first, RUNNER_TEMP_PASSWORD, RUNNER_PASSWORD);
  await expect(first).toHaveURL("/");
  await first.context().storageState({ path: RUNNER_STATE });
  await first.context().close();

  runner = await runnerPage(browser);
  await runner.goto("/");
  const step = (n: number, title: string, command: string, evidenceRequired = false) => ({
    id: `01970000-0000-7000-8000-00000000000${n}`,
    title,
    description: "",
    command,
    verification: "",
    evidenceRequired,
  });
  const created = await runner.request.post("/api/procedures", {
    headers: { origin: BASE_URL },
    data: {
      content: {
        title: "Web サーバーの再起動",
        summary: "",
        tags: [],
        prerequisites: "",
        variables: [
          { name: "host", description: "対象", default: "web01.example.test", secret: false },
          { name: "port", description: "ポート", default: "22", secret: false },
          { name: "admin_password", description: "パスワード", default: null, secret: true },
        ],
        steps: [
          step(1, "ログインする", "ssh #{host} -p #{port}"),
          step(2, "設定を確かめる", "echo '#{admin_password}' | sudo -S nginx -t", true),
        ],
        rollbackSteps: [],
      },
    },
  });
  procedureId = (await created.json()).id;
  // 公開は承認者以上なので、作業者が作った下書きを管理者が公開する（D-65）
  await admin.goto(`/procedures/${procedureId}/edit`);
  await admin.getByRole("button", { name: "公開する" }).click();
  await admin.getByLabel("変更理由").fill("最初の版");
  await admin.getByRole("alertdialog").getByRole("button", { name: "公開する" }).click();
  await expect(admin).toHaveURL(`/procedures/${procedureId}`);
});

test.afterAll(async () => {
  await runner.context().close();
  await admin.context().close();
});

/** S-05 の「実行を開始」から S-10 で開始し、S-12 の URL を返す */
async function start(page: Page): Promise<string> {
  await page.goto(`/procedures/${procedureId}`);
  await page.getByRole("link", { name: "実行を開始" }).click();
  await page.getByLabel("#{admin_password}").fill(SECRET);
  await page.getByRole("button", { name: "開始する" }).click();
  await expect(page).toHaveURL(/\/executions\/[0-9a-f-]{36}$/);
  return page.url();
}

/** クリップボードの中身（e2e の tsconfig には DOM の型がないので、式を文字列で渡す） */
const clipboard = (page: Page) => page.evaluate<string>("navigator.clipboard.readText()");

const card = (page: Page, n: number) =>
  page.locator(`#step-01970000-0000-7000-8000-00000000000${n}`);
const statusGroup = (page: Page, label: string) =>
  page.getByRole("group", { name: `${label}の状態` });

test("F-04 AC: コマンドのコピーでは、変数が値に置き換わる", async () => {
  await start(runner);
  await card(runner, 1).getByRole("button", { name: "値を埋めた状態でコピー" }).click();
  expect(await clipboard(runner)).toBe("ssh web01.example.test -p 22");
  // 秘密変数は画面ではマスクし、コピーでは値まで入る
  await expect(card(runner, 2).getByText(SECRET)).toHaveCount(0);
  await card(runner, 2).getByRole("button", { name: "値を埋めた状態でコピー" }).click();
  expect(await clipboard(runner)).toBe(`echo '${SECRET}' | sudo -S nginx -t`);
});

test("F-04 AC: 秘密変数の値を含むエビデンスは、マスクされて保存される", async () => {
  const url = await start(runner);
  await card(runner, 2).getByRole("button", { name: "エビデンス" }).click();
  await card(runner, 2).getByRole("textbox").fill(`password: ${SECRET}\nsyntax is ok`);
  await card(runner, 2).getByRole("button", { name: "登録する" }).click();
  await expect(card(runner, 2).getByText("password: ●●●●")).toBeVisible();
  await runner.reload();
  await expect(card(runner, 2).getByText("password: ●●●●")).toBeVisible();
  const id = url.split("/").at(-1);
  const body = await (await runner.request.get(`/api/executions/${id}`)).text();
  expect(body).not.toContain(SECRET);
  expect(body).toContain("password: ●●●●");
});

test("F-05 AC: ブラウザを閉じて開き直しても、続きから再開できる", async ({ browser }) => {
  const url = await start(runner);
  await statusGroup(runner, "手順 1").getByRole("button", { name: "完了" }).click();
  await expect(statusGroup(runner, "手順 1").getByRole("button", { name: "完了" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const again = await runnerPage(browser);
  await again.goto(url);
  await expect(statusGroup(again, "手順 1").getByRole("button", { name: "完了" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // 秘密変数の値はブラウザのメモリだけにあるので、入力し直す（D-41）
  await expect(again.getByText("秘密変数の値を入力してください。")).toBeVisible();
  await expect(
    card(again, 2).getByRole("button", { name: "秘密変数の値を入力するとコピーできます" }),
  ).toBeDisabled();
  await again.getByRole("button", { name: "値を入力", exact: true }).click();
  await again.getByLabel("#{admin_password}").fill(SECRET);
  await again.getByRole("button", { name: "入力する" }).click();
  await card(again, 2).getByRole("button", { name: "値を埋めた状態でコピー" }).click();
  expect(await clipboard(again)).toContain(SECRET);
  await again.context().close();
});

test("F-06 AC: エビデンス必須のステップは、エビデンスを登録するまで完了にできない", async () => {
  await start(runner);
  const done = statusGroup(runner, "手順 2").getByRole("button", { name: "完了" });
  await expect(done).toBeDisabled();
  await expect(card(runner, 2).getByText("エビデンスを登録すると完了にできます")).toBeVisible();
  await card(runner, 2).getByRole("button", { name: "エビデンス" }).click();
  await card(runner, 2).getByRole("textbox").fill("syntax is ok");
  await card(runner, 2).getByRole("button", { name: "登録する" }).click();
  await expect(done).toBeEnabled();
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true");
});

test("F-05: 終了すると完了になり、状態を変えられなくなる", async () => {
  await start(runner);
  await runner.getByRole("button", { name: "終了する" }).click();
  await expect(runner.getByRole("alertdialog", { name: "まだ終了できません" })).toBeVisible();
  await runner.getByRole("button", { name: "閉じる" }).click();

  await statusGroup(runner, "手順 1").getByRole("button", { name: "完了" }).click();
  await statusGroup(runner, "手順 2").getByRole("button", { name: "スキップ" }).click();
  const dialog = runner.getByRole("alertdialog");
  await dialog.getByLabel(/理由/).fill(`確認済み ${SECRET}`);
  await dialog.getByRole("button", { name: "スキップにする" }).click();
  await expect(card(runner, 2).getByText("スキップの理由：確認済み ●●●●")).toBeVisible();

  await runner.getByRole("button", { name: "終了する" }).click();
  await runner.getByRole("button", { name: "完了として終了" }).click();
  await expect(runner.getByText("承認待ちです。")).toBeVisible();
  await expect(runner.getByText("完了", { exact: true }).first()).toBeVisible();
  await expect(statusGroup(runner, "手順 1")).toHaveCount(0);
  await expect(runner.getByRole("button", { name: "終了する" })).toHaveCount(0);
});

test("実行者による中止", async () => {
  await start(runner);
  await runner.getByRole("button", { name: "その他の操作" }).click();
  await runner.getByRole("menuitem", { name: "中止する" }).click();
  const dialog = runner.getByRole("alertdialog");
  await dialog.getByLabel(/理由/).fill("時間内に終わらないため");
  await dialog.getByRole("button", { name: "中止する" }).click();
  await expect(runner.getByText("理由：時間内に終わらないため")).toBeVisible();
  await expect(statusGroup(runner, "手順 1")).toHaveCount(0);
});

test("S-11: 実行の一覧で、実行中・承認待ちを絞り込める", async () => {
  await runner.goto("/executions");
  await runner
    .getByRole("button", { name: /承認待ち/ })
    .first()
    .click();
  await expect(runner).toHaveURL(/card=pending/);
  await expect(runner.getByRole("link", { name: /Web サーバーの再起動/ })).toHaveCount(1);
  await runner.goto(`/executions?procedure=${procedureId}`);
  await expect(runner.getByRole("heading", { name: "この手順書の実行" })).toBeVisible();
});

test("D-36: 閲覧者に下げた実行者の実行を、管理者が理由を入れて中止できる", async () => {
  const url = await start(runner);
  await admin.goto(`/admin/users/${runnerId}`);
  const running = admin.getByRole("region", { name: "実行中の実行" });
  await expect(running).toBeVisible();
  // 閲覧者に下げるときは、実行中の実行の件数を案内する。キャンセルすれば作業者のまま
  const viewer = admin.getByRole("radio", { name: /^閲覧者/ });
  await viewer.click();
  const confirm = admin.getByRole("alertdialog");
  await expect(confirm).toContainText("を閲覧者にしますか？");
  await expect(confirm).toContainText("実行中の実行が");
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(admin.getByRole("radio", { name: /^作業者/ })).toBeChecked();

  await viewer.click();
  await admin.getByRole("button", { name: "閲覧者にする" }).click();
  await expect(viewer).toBeChecked();

  await admin.goto(url);
  await admin.getByRole("button", { name: "中止する" }).click();
  const dialog = admin.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "中止する" }).click();
  await expect(dialog.getByText("中止の理由を入力してください。")).toBeVisible();
  await dialog.getByLabel(/理由/).fill("担当を替えてやり直すため");
  await dialog.getByRole("button", { name: "中止する" }).click();
  await expect(admin.getByText("理由：担当を替えてやり直すため")).toBeVisible();
  await expect(admin.getByText("（管理者）")).toBeVisible();
});
