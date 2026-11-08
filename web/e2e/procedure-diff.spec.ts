import { expect, type Page, test } from "@playwright/test";
import { ADMIN_STATE, BASE_URL } from "./helpers.ts";

// F-11 下書きの変更点（S-17）。管理者だけで確かめる（新しいユーザーは作らない）。
// 手順書は API で作って公開し、下書きを保存してから画面を開く。

test.use({ storageState: ADMIN_STATE });

const headers = { origin: BASE_URL };
let seq = 0;

type Step = {
  id: string;
  title: string;
  description: string;
  command: string;
  verification: string;
  evidenceRequired: boolean;
};

const step = (title: string, over: Partial<Step> = {}): Step => {
  seq += 1;
  return {
    id: `01970000-0000-7000-8000-0000000011${String(seq).padStart(2, "0")}`,
    title,
    description: "",
    command: "",
    verification: "",
    evidenceRequired: false,
    ...over,
  };
};

const content = (title: string, steps: Step[], over: Record<string, unknown> = {}) => ({
  title,
  summary: "",
  tags: [],
  prerequisites: "",
  variables: [],
  steps,
  rollbackSteps: [],
  ...over,
});

type Content = ReturnType<typeof content>;

/** 公開して v1 を作り、下書きを保存する。下書きの revision を返す。 */
async function publishedWithDraft(page: Page, base: Content, draft: Content) {
  const created = await page.request.post("/api/procedures", { headers, data: { content: base } });
  expect(created.status()).toBe(201);
  const id: string = (await created.json()).id;
  const published = await page.request.post(`/api/procedures/${id}/publish`, {
    headers,
    data: { content: base, lock: { revision: 1 }, changeReason: "最初の版" },
  });
  expect(published.ok()).toBe(true);
  const saved = await page.request.put(`/api/procedures/${id}/draft`, {
    headers,
    data: { content: draft, lock: { revision: null, versionNo: 1 } },
  });
  expect(saved.ok()).toBe(true);
  const revision: number = (await saved.json()).revision;
  return { id, revision };
}

async function latestVersionNo(page: Page, id: string): Promise<number> {
  const res = await page.request.get(`/api/procedures/${id}`);
  return (await res.json()).latestVersion.versionNo;
}

test("F-11 AC：S-05 から変更点を開き、追加・削除・変更・移動が分かる", async ({ page }) => {
  // 最新版 [a, b, c]、下書き [c, b(タイトル変更), d(追加)]、a は削除
  const [a, b, c, d] = [step("連絡する"), step("退避する"), step("止める"), step("確かめる")];
  const { id } = await publishedWithDraft(
    page,
    content("差分の確認 1", [a, b, c]),
    content("差分の確認 1", [c, { ...b, title: "設定を退避する" }, d]),
  );
  await page.goto(`/procedures/${id}`);
  await page.getByRole("link", { name: "変更点を見る" }).click();
  await expect(page).toHaveURL(`/procedures/${id}/draft/diff`);
  const steps = page.getByRole("region", { name: "手順", exact: true });
  await expect(steps.getByText("移動 3 → 1")).toBeVisible();
  await expect(steps.getByText("削除", { exact: true })).toBeVisible();
  await expect(steps.getByText("追加", { exact: true })).toBeVisible();
  await expect(steps.getByText("変更", { exact: true })).toBeVisible();
  await expect(steps.getByText("3 ステップ（v1 は 3）")).toBeVisible();
});

test("F-11 AC：前に足して番号がずれただけのステップは変更なしにまとまる", async ({ page }) => {
  // 最新版 [a, b]、下書き [d, a, b]
  const [a, b, d] = [step("連絡する"), step("退避する"), step("確かめる")];
  const { id } = await publishedWithDraft(
    page,
    content("差分の確認 2", [a, b]),
    content("差分の確認 2", [d, a, b]),
  );
  await page.goto(`/procedures/${id}/draft/diff`);
  const steps = page.getByRole("region", { name: "手順", exact: true });
  const run = steps.getByRole("button", { name: "変更のないステップ 2 件（2・3）を表示" });
  await expect(run).toBeVisible();
  await expect(steps.getByText(/移動/)).toHaveCount(0);
  // 押すとその場所だけ開く
  await run.click();
  await expect(steps.getByText("連絡する")).toBeVisible();
});

test("F-11 AC：下書きが最新版と同じなら、変更がないと出る", async ({ page }) => {
  const same = content("差分の確認 3", [step("確かめる")]);
  const { id } = await publishedWithDraft(page, same, same);
  await page.goto(`/procedures/${id}/draft/diff`);
  await expect(page.getByText("変更はありません")).toBeVisible();
  await expect(page.getByText("保存した下書きは、公開済みの v1 と同じ内容です。")).toBeVisible();
});

test("S-17 から公開すると S-05 に戻り、版が上がる", async ({ page }) => {
  const a = step("確かめる");
  const { id } = await publishedWithDraft(
    page,
    content("差分の確認 4", [a]),
    content("差分の確認 4", [{ ...a, title: "よく確かめる" }]),
  );
  await page.goto(`/procedures/${id}/draft/diff`);
  await page.getByRole("button", { name: "公開する" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("保存した下書きを公開します。")).toBeVisible();
  await expect(dialog.getByText("v1 からの変更")).toBeVisible();
  await expect(dialog.getByText("手順：変更 1")).toBeVisible();
  // この画面がそれなので「変更点を見る」は出さない
  await expect(dialog.getByRole("link", { name: "変更点を見る" })).toHaveCount(0);
  await dialog.getByLabel("変更理由").fill("確かめ方を直した");
  await dialog.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/procedures/${id}`);
  await expect(page.getByText("v2", { exact: true }).first()).toBeVisible();
  expect(await latestVersionNo(page, id)).toBe(2);
});

test("S-17 を開いた後に下書きが保存し直されたら、公開せずに読み込み直しを出す", async ({
  page,
}) => {
  const a = step("確かめる");
  const draft = content("差分の確認 5", [{ ...a, title: "よく確かめる" }]);
  const { id, revision } = await publishedWithDraft(page, content("差分の確認 5", [a]), draft);
  await page.goto(`/procedures/${id}/draft/diff`);
  await expect(page.getByRole("region", { name: "手順", exact: true })).toBeVisible();

  // 開いた後に、ほかの画面で下書きが保存し直された
  const resaved = await page.request.put(`/api/procedures/${id}/draft`, {
    headers,
    data: { content: { ...draft, summary: "あとから足した" }, lock: { revision } },
  });
  expect(resaved.ok()).toBe(true);

  await page.getByRole("button", { name: "公開する" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("変更理由").fill("古い内容で公開しようとした");
  await dialog.getByRole("button", { name: "公開する" }).click();
  await expect(page.getByText(/管理 花子 が .* に下書きを保存しました。/)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "公開する" })).toBeDisabled();
  expect(await latestVersionNo(page, id)).toBe(1);

  // 読み込み直すと新しい下書きと比べ直し、また公開できる
  await page.getByRole("button", { name: "読み込み直す" }).click();
  await expect(page.getByText("あとから足した")).toBeVisible();
  await expect(page.getByRole("button", { name: "公開する" })).toBeEnabled();
});

test("S-17 を開いている間にほかで公開されても、フォーカスで最新版だけを取り直して比べ直さない", async ({
  page,
}) => {
  const a = step("確かめる");
  const draft = content("差分の確認 8", [{ ...a, title: "よく確かめる" }]);
  const { id, revision } = await publishedWithDraft(page, content("差分の確認 8", [a]), draft);
  await page.goto(`/procedures/${id}/draft/diff`);
  const steps = page.getByRole("region", { name: "手順", exact: true });
  await expect(steps.getByText("変更", { exact: true })).toBeVisible();

  // ほかの画面で、この下書きが公開された
  const published = await page.request.post(`/api/procedures/${id}/publish`, {
    headers,
    data: { content: draft, lock: { revision }, changeReason: "ほかで公開" },
  });
  expect(published.ok()).toBe(true);

  // タブに戻っても、開いたときの最新版と下書きの比べ方のまま（「変更はありません」にならない）
  await page.evaluate("window.dispatchEvent(new Event('visibilitychange'))");
  await page.waitForTimeout(500);
  await expect(page.getByText("変更はありません")).toHaveCount(0);
  await expect(
    page.getByText("公開済みの v1 と、保存した下書きを比べています。", { exact: false }),
  ).toBeVisible();
});

test("公開時の検証に通らない下書きは、S-09 に移ってエラーを出す", async ({ page }) => {
  const a = step("確かめる");
  const { id } = await publishedWithDraft(
    page,
    content("差分の確認 6", [a]),
    content("差分の確認 6", [{ ...a, command: "echo #{nope}" }]),
  );
  await page.goto(`/procedures/${id}/draft/diff`);
  await page.getByRole("button", { name: "公開する" }).click();
  await expect(page).toHaveURL(`/procedures/${id}/edit`);
  await expect(page.getByText("公開できませんでした。次の場所を直してください")).toBeVisible();
  // 再読み込みでは、もう一度は出さない
  await page.reload();
  await expect(page.getByRole("heading", { name: "手順書を編集" })).toBeVisible();
  await expect(page.getByText("公開できませんでした。次の場所を直してください")).toHaveCount(0);
});

test("S-09 の公開のダイアログに v1 からの変更の要約が出る", async ({ page }) => {
  const a = step("確かめる");
  const { id } = await publishedWithDraft(
    page,
    content("差分の確認 7", [a]),
    content("差分の確認 7", [a, step("片付ける")]),
  );
  await page.goto(`/procedures/${id}/edit`);
  await expect(page.getByRole("link", { name: "保存した下書きと v1 の変更点" })).toHaveAttribute(
    "href",
    `/procedures/${id}/draft/diff`,
  );
  // 要約は保存していない今の内容と比べる
  await page.getByLabel("概要", { exact: true }).fill("まだ保存していない概要");
  await page.getByRole("button", { name: "公開する" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("v1 からの変更")).toBeVisible();
  await expect(dialog.getByText("手順：追加 1／ほかに基本情報")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "変更点を見る" })).toHaveAttribute(
    "target",
    "_blank",
  );
});
