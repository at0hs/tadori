import { type Browser, expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, AUTHOR_STATES, BASE_URL, pageAs, setupAuthor } from "./helpers.ts";

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

test("保存の返事を待つ間に打った文字は、保存の後も残り、未保存の印が付く", async () => {
  // 応答を遅らせる
  await author.route("**/api/procedures/*/draft", async (route) => {
    if (route.request().method() === "PUT") await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await author.getByLabel("概要", { exact: true }).fill("保存する概要");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await author.getByLabel("概要", { exact: true }).fill("保存中に打った概要");
  await expect(author.getByText("最終保存 作成者 一郎")).toBeVisible();
  await expect(author.getByLabel("概要", { exact: true })).toHaveValue("保存中に打った概要");
  await expect(author.getByText("保存していない変更があります")).toBeVisible();
  await author.unroute("**/api/procedures/*/draft");
});

test("D-58・UI-05: 変換を確定する Enter ではタグを足さず、全角の「＃｛」は「#{」に直して補完を出す", async () => {
  const cdp = await author.context().newCDPSession(author);
  const composeAndCommit = async (reading: string, committed: string) => {
    for (let i = 1; i <= reading.length; i++) {
      const t = reading.slice(0, i);
      await cdp.send("Input.imeSetComposition", {
        text: t,
        selectionStart: t.length,
        selectionEnd: t.length,
      });
    }
    // 変換中の Enter（実機では keyCode 229 の keydown が先に届き、その後に確定される）
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
    });
    await cdp.send("Input.insertText", { text: committed });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
  };

  const tags = author.getByRole("combobox", { name: "タグ" });
  const chips = author.locator('[data-slot="combobox-chip"]');
  const before = await chips.count();
  await tags.click();
  await composeAndCommit("でーた", "データ");
  await expect(chips).toHaveCount(before);
  await expect(tags).toHaveValue("データ");
  await author.keyboard.press("Enter");
  await expect(chips).toHaveCount(before + 1);
  await expect(chips.last()).toContainText("データ");

  const command = author.getByRole("textbox", { name: "手順 1のコマンド", exact: true });
  await command.click();
  await author.keyboard.press("End");
  await author.keyboard.type(" ");
  await composeAndCommit("＃｛", "＃｛");
  await expect(command).toContainText("sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak #{");
  await expect(author.locator(".cm-tooltip-autocomplete")).toContainText("host");
  await author.keyboard.press("Escape");
  await cdp.detach();
});

test("D-55: 読み込んだ後に他の人が公開していたら、保存はできず、誰がいつ公開したかを出す", async ({
  browser,
}) => {
  const origin = new URL(author.url()).origin;
  const res = await author.request.post("/api/procedures", {
    headers: { origin },
    data: {
      content: {
        title: "証明書の更新",
        summary: "",
        tags: [],
        prerequisites: "",
        variables: [],
        steps: [
          {
            id: "01970000-0000-7000-8000-000000000001",
            title: "証明書を置く",
            description: "",
            command: "",
            verification: "",
            evidenceRequired: false,
          },
        ],
        rollbackSteps: [],
      },
    },
  });
  const { id } = await res.json();
  await author.goto(`/procedures/${id}/edit`);
  await publish(author, "最初の版");
  await expect(author).toHaveURL(`/procedures/${id}`);

  // 2人とも v1 を読み込み（下書きなし）、二郎が公開する
  await author.goto(`/procedures/${id}/edit`);
  const other = await pageAs(browser, AUTHOR_STATES[1]);
  await other.goto(`/procedures/${id}/edit`);
  await other.getByLabel("概要", { exact: true }).fill("二郎の変更");
  await publish(other, "二郎の変更");
  await expect(other).toHaveURL(`/procedures/${id}`);

  await author.getByLabel("概要", { exact: true }).fill("一郎の変更");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    author.getByText("保存できませんでした。読み込んだ後に手順書が変わっています"),
  ).toBeVisible();
  await expect(author.getByText(/作成者 二郎 が .* に新しい版を公開しました。/)).toBeVisible();
  await other.context().close();
  // 次のテストのため、変更を捨てて離れる
  await author.getByRole("button", { name: "自分の変更を捨てて読み込み直す" }).click();
  await author.goto(procedureUrl);
});

test("D-29: 編集中に他の人が未公開の手順書を破棄していたら、削除されたことを伝えて保存させない", async ({
  browser,
}) => {
  await author.goto("/procedures/new");
  await author.getByRole("textbox", { name: /^タイトル/ }).fill("消される手順書");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(author).toHaveURL(/\/edit$/);
  const editUrl = new URL(author.url()).pathname;

  const other = await pageAs(browser, AUTHOR_STATES[1]);
  await other.goto(editUrl);
  await other.getByRole("button", { name: "その他の操作" }).click();
  await other.getByRole("menuitem", { name: "下書きを破棄" }).click();
  await other.getByRole("button", { name: "手順書ごと削除" }).click();
  await expect(other).toHaveURL("/procedures");
  await other.context().close();

  await author.getByLabel("概要", { exact: true }).fill("消された後の変更");
  await author.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    author.getByText("保存できませんでした。この手順書は削除されています"),
  ).toBeVisible();
  await expect(author.getByText("対象が見つかりません。")).toHaveCount(0);
  await expect(author.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(author.getByLabel("概要", { exact: true })).toHaveValue("消された後の変更");
  await author.getByRole("link", { name: "手順書の一覧へ" }).click();
  // 入力は捨てる前提なので、未保存の確認で移る
  await author.getByRole("button", { name: "変更を捨てて移動" }).click();
  await expect(author).toHaveURL("/procedures");
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
  // 編集中（下書きがある）
  await expect(author.getByText(/編集中です。下書きは/)).toBeVisible();
  await author.getByRole("button", { name: "その他の操作" }).click();
  await author.getByRole("menuitem", { name: "アーカイブ" }).click();
  await expect(author.getByText(/編集中の下書き（作成者 .郎、/)).toBeVisible();
  await author.getByRole("button", { name: "アーカイブする" }).click();
  await expect(
    author.getByText("アーカイブした手順書です。新しい実行は始められません。"),
  ).toBeVisible();
  await expect(author.getByRole("link", { name: "編集" })).toHaveCount(0);

  await author.goto(`${procedureUrl}/edit`);
  await expect(author).toHaveURL(new RegExp(`${procedureUrl}\\?notice=archived-edit$`));
  await expect(author.getByText("アーカイブした手順書は編集できません。")).toBeVisible();
});

/**
 * author2 のロールを管理者の API で一時的に変えて fn を流し、承認者に戻す。
 * 1つのファイルで新しいユーザーを作るのは2人までなので、ロールの違う人を作らずに済ませる。
 */
async function asAuthor2With(
  browser: Browser,
  role: "worker" | "viewer",
  fn: (page: Page) => Promise<void>,
) {
  const admin = await pageAs(browser, ADMIN_STATE);
  const other = await pageAs(browser, AUTHOR_STATES[1]);
  const id = (await (await other.request.get("/api/me")).json()).id;
  const setRole = (r: string) =>
    admin.request.put(`/api/admin/users/${id}/role`, {
      headers: { origin: BASE_URL },
      data: { role: r },
    });
  expect((await setRole(role)).ok()).toBe(true);
  try {
    await fn(other);
  } finally {
    expect((await setRole("approver")).ok()).toBe(true);
    await other.context().close();
    await admin.context().close();
  }
}

test("D-34: 閲覧者には「未公開」のカードを出さず、未公開での絞り込みは「すべて」にする", async ({
  browser,
}) => {
  const card = (page: Page, label: string) =>
    page.getByRole("button", { name: new RegExp(`^${label}`) });

  // 承認者には4枚
  await author.goto("/procedures");
  await expect(card(author, "未公開")).toBeVisible();

  await asAuthor2With(browser, "viewer", async (viewer) => {
    await viewer.goto("/procedures");
    await expect(card(viewer, "すべて（アーカイブを除く）")).toBeVisible();
    await expect(card(viewer, "編集中")).toBeVisible();
    await expect(card(viewer, "アーカイブ")).toBeVisible();
    await expect(card(viewer, "未公開")).toHaveCount(0);
    await expect(viewer.getByRole("link", { name: "手順書を作成" })).toHaveCount(0);

    await viewer.goto("/procedures?status=unpublished");
    await expect(card(viewer, "すべて（アーカイブを除く）")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(viewer.getByText("証明書の更新")).toBeVisible();
  });
});

test("D-65: 作業者には「公開する」を出さず案内を出し、保存はでき、アーカイブも出さない", async ({
  browser,
}) => {
  // 公開済みの手順書を API で用意する（承認者の author1 が公開する）
  const headers = { origin: BASE_URL };
  const content = {
    title: "作業者の確認用",
    summary: "",
    tags: [],
    prerequisites: "",
    variables: [],
    steps: [
      {
        id: "01970000-0000-7000-8000-0000000003a1",
        title: "確かめる",
        description: "",
        command: "",
        verification: "",
        evidenceRequired: false,
      },
    ],
    rollbackSteps: [],
  };
  const created = await author.request.post("/api/procedures", { headers, data: { content } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  const published = await author.request.post(`/api/procedures/${id}/publish`, {
    headers,
    data: { content, lock: { revision: 1 }, changeReason: "最初の版" },
  });
  expect(published.ok()).toBe(true);

  await asAuthor2With(browser, "worker", async (worker) => {
    await worker.goto(`/procedures/${id}`);
    await worker.getByRole("button", { name: "その他の操作" }).click();
    await expect(worker.getByRole("menuitem", { name: "版の一覧" })).toBeVisible();
    await expect(worker.getByRole("menuitem", { name: "アーカイブ" })).toHaveCount(0);
    await worker.keyboard.press("Escape");

    await worker.getByRole("link", { name: "編集" }).click();
    await expect(worker).toHaveURL(`/procedures/${id}/edit`);
    await expect(
      worker.getByText("公開は承認者が行います。保存した下書きは、承認者のホームに出ます"),
    ).toBeVisible();
    await expect(worker.getByRole("button", { name: "公開する" })).toHaveCount(0);
    await worker.getByLabel("概要", { exact: true }).fill("作業者が直した");
    await worker.getByRole("button", { name: "保存" }).click();
    await expect(worker.getByText("保存していない変更があります")).toHaveCount(0);
    await expect(worker.getByText(/最終保存/)).toBeVisible();
  });
});
