import { expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, AUTHOR_STATES, pageAs, setupAuthor } from "./helpers.ts";

// F-02・F-03（S-04〜S-09）。上から順に状態を積む。
test.describe.configure({ mode: "serial" });

let author: Page;

test.beforeAll(async ({ browser }) => {
  const admin = await pageAs(browser, ADMIN_STATE);
  await admin.goto("/");
  await setupAuthor(admin, browser, 0);
  await setupAuthor(admin, browser, 1);
  await admin.context().close();
  author = await pageAs(browser, AUTHOR_STATES[0]);
});

test.afterAll(async () => {
  await author.context().close();
});

const section = (page: Page, id: string) => page.locator(`#${id}`);

/** CodeMirror の欄に打ち込む。 */
async function typeInto(page: Page, label: string, text: string) {
  await page.getByRole("textbox", { name: label, exact: true }).click();
  await page.keyboard.type(text);
}

async function addStep(page: Page, list: "sec-steps" | "sec-rb", title: string) {
  await section(page, list).getByRole("button", { name: "ステップを追加" }).last().click();
  const prefix = list === "sec-steps" ? "手順" : "切り戻し手順";
  const count = await section(page, list)
    .getByRole("textbox", { name: /のタイトル$/ })
    .count();
  await page.getByLabel(`${prefix} ${count}のタイトル`, { exact: true }).fill(title);
  return count;
}

async function publish(page: Page, reason: string) {
  await page.getByRole("button", { name: "公開する" }).click();
  await page.getByLabel("変更理由").fill(reason);
  await page.getByRole("alertdialog").getByRole("button", { name: "公開する" }).click();
}

let procedureUrl = "";

test("F-02 AC: タイトルのない手順書は保存できない", async () => {
  await author.goto("/procedures");
  await author.getByRole("link", { name: "手順書を作成" }).click();
  await expect(author).toHaveURL("/procedures/new");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(author.getByText("タイトルを入力してください。")).toBeVisible();
  await expect(author).toHaveURL("/procedures/new");
});

test("F-02/F-03: 作成・保存・公開で v1 ができ、詳細と版の一覧に出る", async () => {
  await author.getByRole("textbox", { name: /^タイトル/ }).fill("nginx の設定変更");
  await author.getByLabel("概要", { exact: true }).fill("web01 の nginx の worker 数を変更する");

  await section(author, "sec-var").getByRole("button", { name: "変数を追加" }).click();
  await author.getByLabel("変数 1 の名前", { exact: true }).fill("host");
  await author.getByLabel("変数 1 の説明", { exact: true }).fill("対象ホスト");

  await addStep(author, "sec-steps", "設定ファイルのバックアップ");
  // #{ の入力補完で host を選ぶ（D-06）
  await typeInto(author, "手順 1のコマンド", "ssh #{");
  await expect(author.locator(".cm-tooltip-autocomplete li[aria-selected]")).toContainText("host");
  // CodeMirror は候補が出た直後（interactionDelay、75ms）のキー操作を受け付けない
  await author.waitForTimeout(150);
  await author.keyboard.press("Enter");
  await author.keyboard.type(" sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak");
  await expect(author.getByRole("textbox", { name: "手順 1のコマンド", exact: true })).toHaveText(
    "ssh #{host} sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak",
  );

  await author.getByRole("button", { name: "保存", exact: true }).click();
  // 最初の保存で手順書ができ、URL が編集画面に置き換わる
  await expect(author).toHaveURL(/\/procedures\/[0-9a-f-]{36}\/edit$/);
  await expect(author.getByText("未公開の手順書")).toBeVisible();

  await publish(author, "最初の版");
  await expect(author).toHaveURL(/\/procedures\/[0-9a-f-]{36}$/);
  procedureUrl = new URL(author.url()).pathname;
  await expect(author.getByRole("heading", { name: "nginx の設定変更", level: 1 })).toBeVisible();
  await expect(author.getByText("v1").first()).toBeVisible();
  await expect(author.getByText("ssh #{host} sudo cp")).toBeVisible();

  await author.goto(`${procedureUrl}/versions`);
  await expect(author.getByText("最初の版")).toBeVisible();
});

test("F-02 AC: 未定義の変数を参照していると公開できない", async () => {
  await author.goto(`${procedureUrl}/edit`);
  await addStep(author, "sec-steps", "設定の再読み込み");
  await typeInto(author, "手順 2のコマンド", "ssh #{nohost} sudo systemctl reload nginx");
  await author.getByRole("button", { name: "公開する" }).click();
  await expect(author.getByText("公開できませんでした。次の場所を直してください")).toBeVisible();
  await expect(author.getByRole("button", { name: "手順 2「設定の再読み込み」" })).toBeVisible();
  await expect(author.getByText("未定義の変数 #{nohost} を参照しています。").last()).toBeVisible();
  // ダイアログは開かない
  await expect(author.getByRole("alertdialog")).toHaveCount(0);
});

test("未保存の変更があるときに移動すると確認が出る", async () => {
  await author
    .getByRole("navigation", { name: "メニュー" })
    .getByRole("link", { name: "手順書" })
    .click();
  await expect(author.getByText("保存していない変更があります").last()).toBeVisible();
  await author.getByRole("button", { name: "編集を続ける" }).click();
  await expect(author).toHaveURL(/\/edit$/);
});

test("F-03 AC: 他の人が先に保存した下書きを上書きできない", async ({ browser }) => {
  // 1人目は今の変更を捨てて開き直す
  await author.goto(procedureUrl);
  await author.goto(`${procedureUrl}/edit`);
  const other = await pageAs(browser, AUTHOR_STATES[1]);
  await other.goto(`${procedureUrl}/edit`);

  await other.getByLabel("概要", { exact: true }).fill("二郎が変えた概要");
  await other.getByRole("button", { name: "保存", exact: true }).click();
  await expect(other.getByText("最終保存")).toBeVisible();

  await author.getByLabel("概要", { exact: true }).fill("一郎が変えた概要");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    author.getByText("保存できませんでした。ほかの人が先に下書きを保存しています"),
  ).toBeVisible();
  await expect(author.getByText(/作成者 二郎 が .* に保存しました。/)).toBeVisible();
  await expect(author.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(author.getByLabel("概要", { exact: true })).toHaveValue("一郎が変えた概要");

  // 自分の変更を捨てて読み込み直すと、相手の内容になって保存できる
  await author.getByRole("button", { name: "自分の変更を捨てて読み込み直す" }).click();
  await expect(author.getByLabel("概要", { exact: true })).toHaveValue("二郎が変えた概要");
  await expect(author.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await other.context().close();
});

test("F-02 AC: 手順のステップが1つもない手順書は公開できない", async () => {
  await author.goto("/procedures/new");
  await author.getByRole("textbox", { name: /^タイトル/ }).fill("書きかけの手順書");
  await author.getByRole("button", { name: "公開する" }).click();
  await expect(
    author.getByText("公開するには、手順のステップが1つ以上必要です。").first(),
  ).toBeVisible();
});

test("D-29: 未公開の手順書は、下書きの破棄で一覧から消える", async () => {
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(author).toHaveURL(/\/edit$/);
  await author.getByRole("button", { name: "その他の操作" }).click();
  await author.getByRole("menuitem", { name: "下書きを破棄" }).click();
  await expect(author.getByText("手順書ごと削除されます")).toBeVisible();
  await author.getByRole("button", { name: "手順書ごと削除" }).click();
  await expect(author).toHaveURL("/procedures");
  await expect(author.getByText("nginx の設定変更")).toBeVisible();
  await expect(author.getByText("書きかけの手順書")).toHaveCount(0);
});

test("D-07: アーカイブすると「編集」が出なくなり、編集画面を開くと詳細に戻される", async () => {
  await author.goto(procedureUrl);
  // 編集中（二郎の下書きがある）
  await expect(author.getByText(/編集中です。下書きは/)).toBeVisible();
  await author.getByRole("button", { name: "その他の操作" }).click();
  await author.getByRole("menuitem", { name: "アーカイブ" }).click();
  await expect(author.getByText(/編集中の下書き（作成者 二郎、/)).toBeVisible();
  await author.getByRole("button", { name: "アーカイブする" }).click();
  await expect(
    author.getByText("アーカイブした手順書です。新しい実行は始められません。"),
  ).toBeVisible();
  await expect(author.getByRole("link", { name: "編集" })).toHaveCount(0);

  await author.goto(`${procedureUrl}/edit`);
  await expect(author).toHaveURL(new RegExp(`${procedureUrl}\\?notice=archived-edit$`));
  await expect(author.getByText("アーカイブした手順書は編集できません。")).toBeVisible();
});
