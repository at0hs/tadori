# web の土台と F-01 の画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/` に画面の土台（ルーター・Query・shadcn/ui・テーマ・API クライアント・ログインの確認）を作り、F-01 の画面（S-01、S-02、S-13〜S-15）と共通の枠を動かす。

**Architecture:** Vite ＋ React に TanStack Router（ファイルでルート）と TanStack Query を載せる。ログインが必要な画面は `_app` レイアウトの `beforeLoad` で `GET /api/me` を確かめて振り分ける。アプリの API は Hono RPC（`hc<AppType>`）をエラーを投げる `fetch` で包んで呼び、ログイン・ログアウト・パスワードの変更だけ Better Auth のクライアントで呼ぶ。

**Tech Stack:** React 19、Vite 8、TanStack Router・Query、shadcn/ui（`base-nova`、Base UI）、Tailwind CSS v4、lucide-react、React Hook Form ＋ Zod、better-auth 1.7.17 のクライアント、Vitest、Playwright。

**Spec:** `../tadori-docs/design/ui.md`（承認済み）。見た目の正本は `../tadori-docs/design/mockups/frame.html`。画面の内容は `../tadori-docs/design/screens.md` の S-01、S-02、S-13〜S-16 と 8章。

## Global Constraints

- 文言はすべて日本語。データ・例はダミーだけ（`example.test` など）。
- 色は CSS 変数だけで指定する。部品で `bg-white`・`text-emerald-600` などを直接書かない（例外：ヘッダの上の `bg-white/10`〜`/20`）。`--brand-hue: 270`。値は `frame.html` の `:root` と `.dark` から写す（D-62）。
- shadcn/ui は Base UI。`render` プロパティで組み合わせ、`asChild` を使わない。部品は `web/src/components/ui/` に置き、使う前に実装を確認する。
- Enter で何かを実行する処理では `event.nativeEvent.isComposing` なら何もしない。
- テーマの保存は `localStorage` のキー `tadori.theme`（値は `light`・`dark`・`system`）。
- `redirect` はアプリ内のパス（`/` で始まり `//` と `/\` で始まらない）だけを受け付ける。
- better-auth は `1.7.17` に固定（サーバーと同じ）。新しすぎる版で pnpm が `minimumReleaseAgeExclude` を書き足したら、コミットしない。
- `web/` が `server/` から取り込むのは型だけ（`import type`）。
- 守りは API にある。画面の出し分けは使いやすさのため（操作できないボタンは出さない）。
- 時刻の表示（ui.md 5.4 の `lib/format.ts`）は、F-01 の画面に時刻を出す所がないので、この計画では作らない。最初に時刻を出す画面で作る。

## Review Focus

1. **操作の途中でセッションが切れる**：ロールのスイッチなどを押したら `/login?redirect=<今のパス>` に移り、ログインし直すと元の画面に戻る → Task 3 の E2E「セッションが切れたら」。
2. **`redirect` に外のサイト**（`//evil.example.test`、`https://evil.example.test`、`/\evil`）：ログイン後は `/` に行く → Task 2 の `safeRedirect` のテスト、Task 3 の E2E。
3. **自分のロールを変えた管理者**：ヘッダの名前の横のロールとメニューがすぐ変わる（`me` を取り直す）→ Task 4 の E2E「自分に作成者ロールを付ける」。
4. **ボタンの二度押し**：作成・変更・無効化・再設定は送信中はボタンを押せない（`isPending` で `disabled`）→ Task 4 の各フォームとダイアログ。E2E では「作成する」を押した直後に `toBeDisabled()` を確かめる。
5. **検索の大文字・前後の空白**：`q=" YAMA "` でも `yamada` が出る → Task 4 の `filterUsers` のテスト。

---

## ファイルの構成

```
web/
  index.html                       テーマのクラスを React より前に付けるスクリプト
  vite.config.ts                   React・Tailwind・TanStack Router のプラグイン、@ の別名
  components.json                  shadcn（base-nova）
  playwright.config.ts             E2E（Task 3）
  e2e/
    start-server.ts                テスト用 DB を空にしてから API を起動する
    helpers.ts                     ログインなどの補助
    auth.spec.ts                   S-01・S-02・振り分け・テーマ（Task 3）
    users.spec.ts                  S-13〜S-15（Task 4）
  src/
    main.tsx                       Router・Query の組み立て
    index.css                      Tailwind とテーマの変数
    routeTree.gen.ts               生成物（コミットする。Biome の対象外）
    routes/
      __root.tsx                   見つからない（S-16）
      login.tsx                    S-01
      _app.tsx                     ログインの確認と AppShell
      _app/index.tsx               ホーム（S-03 は後で。今は案内だけ）
      _app/procedures/index.tsx    準備中（F-02 で置き換える）
      _app/executions/index.tsx    準備中（F-07 で置き換える）
      _app/account/password.tsx    S-02
      _app/admin.tsx               管理者でなければ「権限がありません」
      _app/admin/users/index.tsx   S-13
      _app/admin/users/new.tsx     S-14
      _app/admin/users/$userId.tsx S-15
    components/
      ui/                          shadcn の部品
      app-shell.tsx                ヘッダ・ナビ・自分のメニュー
      app-logo.tsx                 ロゴの置き場（仮のアイコン footprints）
      page-header.tsx              見出し・説明・主な操作・パンくず
      empty-state.tsx              0件・準備中・権限なし・見つからない
      error-banner.tsx             画面全体のエラーの帯
    lib/
      theme.ts / theme.test.ts
      api.ts / api.test.ts         ApiError・toApiError・api クライアント
      redirect.ts / redirect.test.ts
      query.ts / query.test.ts     QueryClient と共通のエラー処理
      auth-client.ts               Better Auth のクライアント
      nav.ts / nav.test.ts         メニューの項目
      roles.ts                     ロールの表示名とアイコン
    features/
      me/queries.ts                meQueryOptions
      me/password-form.tsx         S-02 のフォーム
      auth/login-form.tsx          S-01 のフォーム
      users/queries.ts             一覧・詳細・変更の Query
      users/filter.ts / filter.test.ts
      users/user-list.tsx          S-13 の中身
      users/user-create-form.tsx   S-14
      users/user-detail.tsx        S-15 の中身
      users/role-switches.tsx
      users/user-actions-menu.tsx  「⋯」のメニュー
      users/ban-user-dialog.tsx
      users/reset-password-dialog.tsx
```

---

### Task 1: 見た目の土台（Tailwind・shadcn・テーマ）

**Files:**
- Modify: `web/package.json`、`web/vite.config.ts`、`web/tsconfig.app.json`、`web/index.html`、`web/src/main.tsx`、`vitest.config.ts`（ルート）、`biome.json`
- Create: `web/components.json`、`web/src/index.css`、`web/src/components/ui/*`、`web/src/lib/theme.ts`、`web/src/lib/theme.test.ts`、`web/vitest.config.ts`
- Delete: `web/src/App.tsx`

**Interfaces:**
- Produces:
  - `type ThemePreference = "light" | "dark" | "system"`
  - `THEME_STORAGE_KEY = "tadori.theme"`
  - `readThemePreference(storage: Pick<Storage, "getItem">): ThemePreference`（知らない値・なしは `"system"`）
  - `resolveTheme(pref: ThemePreference, prefersDark: boolean): "light" | "dark"`
  - `applyTheme(pref: ThemePreference): void`（保存し、`<html>` の `dark` クラスを付け外し）
  - `useTheme(): { preference: ThemePreference; setPreference(p: ThemePreference): void }`（`system` のときは OS の変化に追従）
  - 別名 `@/` → `web/src/`
  - shadcn の部品：`button`、`input`、`label`、`badge`、`switch`、`dialog`、`alert-dialog`、`dropdown-menu`、`skeleton`、`toggle-group`

- [ ] **Step 1: 依存を入れる**
  `pnpm --filter @tadori/web add tailwindcss @tailwindcss/vite lucide-react` と、`-D vitest jsdom`（web のテストは `environment: "jsdom"`）。
- [ ] **Step 2: 別名と Tailwind を設定する**
  `tsconfig.app.json` に `"baseUrl": "."`、`"paths": { "@/*": ["./src/*"] }`。`vite.config.ts` に `@tailwindcss/vite` と `resolve.alias`（`@` → `src`）。
- [ ] **Step 3: shadcn を入れる**
  `web/` で `pnpm dlx shadcn@latest init -t vite -b base -p nova`（対話なしで終わる。`components.json` の `style` が `base-nova` になることを確かめる）。続けて上の部品を `pnpm dlx shadcn@latest add ...` で入れる。
- [ ] **Step 4: テーマの変数を写す**
  `index.css` の `:root` と `.dark` を `frame.html` の値に置き換える（`--brand-hue: 270`、`--chrome`・`--chrome-foreground`・`--success`・`--warning` を足し、`@theme inline` に `--color-chrome` などを足す）。`--font-sans` は `"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif`（Geist は外す）。`@custom-variant dark (&:where(.dark, .dark *));`。`@media (prefers-reduced-motion: reduce)` で `animation`・`transition` を止める。
- [ ] **Step 5: テストを書く（`theme.test.ts`）**

```ts
test("保存がなければ OS に合わせる", () => {
  expect(readThemePreference({ getItem: () => null })).toBe("system");
});
test("知らない値は OS に合わせる", () => {
  expect(readThemePreference({ getItem: () => "blue" })).toBe("system");
});
test.each([
  ["light", true, "light"], ["dark", false, "dark"],
  ["system", true, "dark"], ["system", false, "light"],
] as const)("%s（OS がダーク=%s）は %s", (pref, prefersDark, want) => {
  expect(resolveTheme(pref, prefersDark)).toBe(want);
});
test("applyTheme は保存して html に dark を付ける", () => {
  applyTheme("dark");
  expect(localStorage.getItem("tadori.theme")).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  applyTheme("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
```

- [ ] **Step 6: テストが落ちることを確かめる**
  ルートの `vitest.config.ts` の `projects` に `"web"` を足し、`web/vitest.config.ts`（`name: "web"`、`environment: "jsdom"`、`@` の別名）を作る。
  Run: `pnpm vitest run --project web` / Expected: FAIL（`theme.ts` がない）
- [ ] **Step 7: `theme.ts` を書く**
- [ ] **Step 8: `index.html` に、React より前に動く小さなスクリプトを入れる**
  `localStorage` の `tadori.theme` と `matchMedia("(prefers-color-scheme: dark)")` で `<html>` に `dark` を付ける（`resolveTheme` と同じ規則。読めなければ何もしない）。
- [ ] **Step 9: 確かめる**
  `App.tsx` を消し、`main.tsx` は仮に `Button` を1つ出すだけにする。
  Run: `pnpm vitest run --project web`、`pnpm typecheck`、`pnpm lint`、`pnpm build` / Expected: すべて通る
- [ ] **Step 10: Commit** `git commit -m "web に Tailwind・shadcn/ui とテーマを入れる"`

---

### Task 2: API クライアントとエラー、redirect の検証

**Files:**
- Modify: `server/package.json`（`exports` に `"./app": "./src/app.ts"`）、`web/package.json`（devDependencies に `"@tadori/server": "workspace:*"`）、`web/tsconfig.app.json`（`types` に `"node"` を足す。server のソースを型検査するため）、`shared/src/schemas/users.ts`
- Create: `web/src/lib/api.ts`、`api.test.ts`、`redirect.ts`、`redirect.test.ts`、`query.ts`、`query.test.ts`

**Interfaces:**
- Consumes: `ERROR_CODES`・`ErrorCode`（`@tadori/shared`）、`AppType`（`@tadori/server/app`、型だけ）
- Produces:
  - `class ApiError extends Error { code: ErrorCode | "UNKNOWN"; status: number; errors: FieldError[] }`（`FieldError = { path: string; message: string }`、`message` は Problem Details の `detail`）
  - `toApiError(res: Response): Promise<ApiError>`（JSON でない・`code` が一覧にない → `code: "UNKNOWN"`、`message: "エラーが発生しました。時間をおいて試してください。"`）
  - `api`：`hc<AppType>("/", { fetch: apiFetch })`。`apiFetch` は `!res.ok` なら `toApiError` を投げる。呼び方の例 `await (await api.api.admin.users.$get()).json()`
  - `isApiError(e: unknown, code?: ErrorCode): e is ApiError`
  - `safeRedirect(value: unknown): string`（合わなければ `"/"`）
  - `globalErrorAction(e: unknown): "login" | "change-password" | null`（`UNAUTHENTICATED` → `"login"`、`PASSWORD_CHANGE_REQUIRED` → `"change-password"`）
  - `createQueryClient(onGlobalError: (action: "login" | "change-password") => void): QueryClient`（`QueryCache` と `MutationCache` の `onError` で `globalErrorAction` を呼ぶ。`retry` は `ApiError` なら 0、それ以外は 1。`refetchOnWindowFocus: true`）
  - shared：`passwordSchema`（8〜128文字。今の `temporaryPasswordSchema` の中身をこちらに移し、`temporaryPasswordSchema = passwordSchema` とする）

- [ ] **Step 1: テストを書く**

```ts
// api.test.ts
test("Problem Details を ApiError にする", async () => {
  const res = new Response(JSON.stringify({ status: 400, code: "VALIDATION_FAILED", detail: "入力に誤りがあります。",
    errors: [{ path: "username", message: "ユーザー名は3文字以上にしてください。" }] }),
    { status: 400, headers: { "content-type": "application/problem+json" } });
  const e = await toApiError(res);
  expect(e).toMatchObject({ code: "VALIDATION_FAILED", status: 400, message: "入力に誤りがあります。" });
  expect(e.errors).toEqual([{ path: "username", message: "ユーザー名は3文字以上にしてください。" }]);
});
test("JSON でない応答は UNKNOWN", async () => {
  const e = await toApiError(new Response("<html>", { status: 502 }));
  expect(e).toMatchObject({ code: "UNKNOWN", status: 502 });
});
// redirect.test.ts
test.each(["/admin/users", "/admin/users?status=banned"])("%s は通す", (v) => expect(safeRedirect(v)).toBe(v));
test.each(["//evil.example.test", "https://evil.example.test", "/\\evil", "admin", "", undefined, 1])(
  "%s は / にする", (v) => expect(safeRedirect(v)).toBe("/"));
// query.test.ts
test("未認証はログインへ、パスワード変更が必要は変更へ、他は何もしない", () => {
  expect(globalErrorAction(new ApiError({ code: "UNAUTHENTICATED", status: 401 }))).toBe("login");
  expect(globalErrorAction(new ApiError({ code: "PASSWORD_CHANGE_REQUIRED", status: 403 }))).toBe("change-password");
  expect(globalErrorAction(new ApiError({ code: "FORBIDDEN", status: 403 }))).toBeNull();
  expect(globalErrorAction(new Error("x"))).toBeNull();
});
```

  （`ApiError` のコンストラクタは `{ code, status, message?, errors? }` を1つ受け取る。`erasableSyntaxOnly` のため、引数でのプロパティ宣言は使わない。）
- [ ] **Step 2: 落ちることを確かめる** Run: `pnpm vitest run --project web` / Expected: FAIL
- [ ] **Step 3: `api.ts`・`redirect.ts`・`query.ts` を書き、shared に `passwordSchema` を足す**
- [ ] **Step 4: 通ることを確かめる** Run: `pnpm vitest run`（全部）、`pnpm typecheck`（`hc<AppType>` の型が web で解けること）/ Expected: PASS
- [ ] **Step 5: Commit** `git commit -m "web に API クライアントと共通のエラー処理を作る"`

---

### Task 3: ルーター・ログインの流れ・共通の枠（S-01、S-02、S-16）と E2E の仕組み

**Files:**
- Modify: `web/vite.config.ts`（`@tanstack/router-plugin/vite`、`autoCodeSplitting: true`、React のプラグインより前）、`web/src/main.tsx`、`biome.json`（`!web/src/routeTree.gen.ts`）、`package.json`（ルート。`"e2e": "pnpm --filter @tadori/web e2e"`）、`.github/workflows/ci.yml`
- Create: 「ファイルの構成」の `routes/` の S-13〜S-15 以外、`components/` の5つ、`lib/auth-client.ts`、`lib/nav.ts`・`nav.test.ts`、`lib/roles.ts`、`features/me/queries.ts`、`features/me/password-form.tsx`、`features/auth/login-form.tsx`、`web/playwright.config.ts`、`web/e2e/start-server.ts`、`web/e2e/helpers.ts`、`web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: Task 1 の `useTheme`、Task 2 の `api`・`isApiError`・`safeRedirect`・`createQueryClient`
- Produces:
  - ルーターの context：`{ queryClient: QueryClient }`（`createRootRouteWithContext`）
  - `meQueryOptions`：`queryKey: ["me"]`、`GET /api/me`、`staleTime: 30_000`
  - `_app` の `beforeLoad`：`ensureQueryData(meQueryOptions)`。`UNAUTHENTICATED` → `redirect({ to: "/login", search: { redirect: location.href } })`。`me.mustChangePassword` で行き先が `/account/password` 以外 → そこへ。戻り値 `{ me }` を子のルートが `Route.useRouteContext()` で使う
  - `/login` の `validateSearch`：`{ redirect?: string }`。ログイン済みで開いたら `safeRedirect(redirect)` へ
  - `authClient = createAuthClient({ plugins: [usernameClient()] })`（`better-auth/react`、`better-auth/client/plugins`）
  - `NAV_ITEMS: { label: string; to: string; icon: LucideIcon; adminOnly?: true }[]`（ホーム `/`・手順書 `/procedures`・実行 `/executions`・管理 `/admin/users`）、`visibleNavItems(roles: Role[]): NavItem[]`
  - `ROLE_LABELS: Record<Role, string>`（管理者・作成者・実行者・承認者・閲覧者）、`ROLE_ICONS: Record<Role, LucideIcon>`（shield・pencil-line・play・badge-check・eye）
  - `<AppShell me={me}>`：`me.mustChangePassword` ならメニューを出さない
  - `<PageHeader title description? action? breadcrumbs?: { label: string; to?: string }[]>`
  - `<EmptyState icon title description? action?>`、`<ErrorBanner error={unknown}>`（`ApiError` なら `message`、ほかは既定の文）
  - `main.tsx` の `onGlobalError`：`"login"` → `queryClient.clear()` して `/login?redirect=<今の href>`、`"change-password"` → `/account/password`
  - Playwright の設定：`workers: 1`、`fullyParallel: false`、`projects` は Chromium だけ、`baseURL: "http://localhost:5174"`、`webServer` は API（`e2e/start-server.ts`）と画面（`vite --port 5174 --strictPort`）の2つ
  - E2E：API は `PORT=3100`、画面は `vite --port 5174`、`APP_URL=http://localhost:5174`、DB はテスト用 DB（`TEST_DATABASE_URL` か `postgres://tadori:tadori-test@localhost:5434/tadori_test`）、初期管理者は `admin` ／ `E2e-initial-passw0rd`（ダミー）。`start-server.ts` は server の `test/global-setup.ts` と同じ手順で DB を空にしてマイグレーションしてから `server/src/index.ts` を起動する

- [ ] **Step 1: 依存を入れる**
  `@tanstack/react-router`、`@tanstack/react-query`、`better-auth@1.7.17`、`react-hook-form`、`@hookform/resolvers`、`zod`、`-D @tanstack/router-plugin @playwright/test`。`pnpm --filter @tadori/web exec playwright install chromium`。
- [ ] **Step 2: `nav.test.ts` を書いて落とす**

```ts
test("管理者でなければ管理を出さない", () => {
  expect(visibleNavItems(["executor"]).map((i) => i.label)).toEqual(["ホーム", "手順書", "実行"]);
  expect(visibleNavItems(["admin"]).map((i) => i.label)).toEqual(["ホーム", "手順書", "実行", "管理"]);
});
```
  Run: `pnpm vitest run --project web` / Expected: FAIL
- [ ] **Step 3: `nav.ts`・`roles.ts` を書いて通す**
- [ ] **Step 4: E2E の仕組みと `auth.spec.ts` を書く**（`test.describe.configure({ mode: "serial" })`。サーバーは1回だけ起動し、DB は最初に空になる。上から順に状態を積む）

```ts
test("初期管理者は初回ログインでパスワードの変更に移され、メニューは出ない", async ({ page }) => {
  await login(page, "admin", INITIAL_PASSWORD);
  await expect(page).toHaveURL("/account/password");
  await expect(page.getByText("パスワードの変更が必要です")).toBeVisible();
  await expect(page.getByRole("link", { name: "手順書" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page).toHaveURL("/account/password");
});
test("確認の入力が合わなければ送らない", async ({ page }) => { /* 欄の下に「新しいパスワードと一致しません」 */ });
test("パスワードを変えるとホームに移り、管理のメニューが出る", async ({ page }) => {
  // 変更 → toHaveURL("/") → getByRole("link", { name: "管理" }) が見える
});
test("ログインに失敗すると、理由を区別せずに伝える", async ({ page }) => {
  await login(page, "admin", "wrong-password");
  await expect(page.getByText("ログインできませんでした")).toBeVisible();
});
test("ログイン前に開こうとした画面に、ログイン後に戻る", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await login(page, "admin", ADMIN_PASSWORD);
  await expect(page).toHaveURL("/admin/users");
});
test("redirect に外のサイトを入れても / に行く", async ({ page }) => {
  await page.goto("/login?redirect=//evil.example.test");
  await login(page, "admin", ADMIN_PASSWORD);
  await expect(page).toHaveURL("/");
});
test("セッションが切れたら、ログインし直して元の画面に戻る", async ({ page, context }) => {
  // ログイン → /admin/users → context.clearCookies() → 「すべて」のカードを押すなどで再取得させる
  // → toHaveURL(/\/login\?redirect=%2Fadmin%2Fusers/) → ログイン → toHaveURL(/\/admin\/users/)
});
test("テーマをダークにすると、再読み込みしてもダークのまま", async ({ page }) => {
  // 自分のメニュー → テーマのダーク → html に class dark → reload → まだ dark
});
test("ログアウトするとログイン画面に移り、戻っても画面を見られない", async ({ page }) => { /* ... */ });
test("存在しない URL は「見つかりません」", async ({ page }) => { /* /no-such-page */ });
```

  `helpers.ts` に `login(page, username, password)`、定数 `INITIAL_PASSWORD`・`ADMIN_PASSWORD`（`E2e-admin-passw0rd`）。
  Run: `pnpm e2e` / Expected: FAIL（画面がない）
  （「セッションが切れたら」は、Task 4 の画面ができるまでは `/` で `me` を取り直させる形で書き、Task 4 で `/admin/users` に直してよい。）
- [ ] **Step 5: ルート・部品・フォームを書く**
  - S-01：`frame.html` の「S-01 ログイン」。`authClient.signIn.username`。失敗はすべて「ログインできませんでした」。成功したら `["me"]` を取り直し、`mustChangePassword` なら `/account/password`、ほかは `safeRedirect(search.redirect)`。
  - S-02：`frame.html` の「S-02」。フォームの Zod は `{ currentPassword: z.string().min(1), newPassword: passwordSchema, confirm: z.string() }` に、`confirm` が違えば `path: ["confirm"]`・「新しいパスワードと一致しません」。`authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`。現在のパスワードが違えば `currentPassword` の欄に「現在のパスワードが違います」。成功したら `["me"]` を取り直し、変更が必要だった人は `/`、ほかは「パスワードを変更しました」と出してその場に留まる。
  - AppShell：`frame.html` の「ナビ：ヘッダに置く」。自分のメニュー（`dropdown-menu`）に名前・ロール（`ROLE_LABELS` を「・」でつなぐ）・テーマ（`toggle-group`：ライト／ダーク／OS に合わせる）・パスワードの変更・ログアウト（`authClient.signOut()` → `queryClient.clear()` → `/login`）。今いるメニューは太字と下線（`activeProps`）。
  - `__root.tsx` の `notFoundComponent`：`EmptyState`「ページが見つかりません」とホームへのリンク。
  - ホーム・手順書・実行：`EmptyState`「この画面はまだありません」（ホームは手順書と実行への案内も）。
  - `_app/admin.tsx`：`me.roles` に `admin` がなければ `EmptyState`「このページを開く権限がありません」。
  - フォームの送信ボタンは送信中は `disabled`。
- [ ] **Step 6: 通ることを確かめる** Run: `pnpm e2e`、`pnpm vitest run --project web`、`pnpm typecheck`、`pnpm lint` / Expected: すべて通る
- [ ] **Step 7: 見た目を確かめる**
  `pnpm dev` で S-01・S-02・ヘッダ・自分のメニューをライトとダークで開き、`frame.html` と見比べる（色・余白・文字の大きさ・動き）。
- [ ] **Step 8: CI に E2E を足す**
  `pnpm test` の後に `pnpm --filter @tadori/web exec playwright install --with-deps chromium` と `pnpm e2e`。失敗したら `web/playwright-report` を artifact に残す。`.gitignore` に `web/playwright-report`・`web/test-results`。
- [ ] **Step 9: Commit** `git commit -m "画面のルーター・ログインの流れ・共通の枠を作る"`

---

### Task 4: ユーザー管理の画面（S-13〜S-15）

**Files:**
- Create: `routes/_app/admin/users/index.tsx`・`new.tsx`・`$userId.tsx`、`features/users/*`（「ファイルの構成」のとおり）、`web/e2e/users.spec.ts`

**Interfaces:**
- Consumes: Task 2 の `api`・`ApiError`、Task 3 の `PageHeader`・`EmptyState`・`ErrorBanner`・`ROLE_LABELS`・`ROLE_ICONS`・`meQueryOptions`、`AdminUser`・`createUserRequestSchema`・`passwordResetRequestSchema`（shared）
- Produces:
  - `type UserStatusFilter = "active" | "must-change" | "banned" | "all"`
  - `countByStatus(users: AdminUser[]): Record<UserStatusFilter, number>`（有効＝`!banned`、変更が必要＝`!banned && mustChangePassword`、無効＝`banned`、すべて＝全員）
  - `filterUsers(users: AdminUser[], f: { status: UserStatusFilter; q: string }): AdminUser[]`（`q` は前後の空白を除き、名前かユーザー名の部分一致、大文字と小文字を区別しない。並びは受け取った順）
  - S-13 の `validateSearch`：`{ status: UserStatusFilter（既定 "active"）; q: string（既定 ""）}`。既定値は URL に出さない
  - `usersQueryOptions`（`["admin", "users"]`）、`userQueryOptions(id)`（`["admin", "users", id]`）
  - 変更の後は `["admin", "users"]` を取り直す。対象が自分なら `["me"]` も取り直す

- [ ] **Step 1: `filter.test.ts` を書く**

```ts
const u = (name: string, username: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id: crypto.randomUUID(), name, username, email: `${username}@example.test`, roles: [],
  banned: false, mustChangePassword: false, createdAt: "2026-11-07T00:00:00.000Z", ...o });
const users = [u("山田 太郎", "yamada"), u("佐藤 次郎", "sato", { mustChangePassword: true }),
  u("伊藤 六郎", "ito", { banned: true, mustChangePassword: true })];
test("数え方", () => {
  expect(countByStatus(users)).toEqual({ active: 2, "must-change": 1, banned: 1, all: 3 });
});
test("状態で絞る", () => {
  expect(filterUsers(users, { status: "banned", q: "" }).map((x) => x.username)).toEqual(["ito"]);
});
test("前後の空白と大文字を無視して、名前かユーザー名で探す", () => {
  expect(filterUsers(users, { status: "all", q: " YAMA " }).map((x) => x.username)).toEqual(["yamada"]);
  expect(filterUsers(users, { status: "all", q: "佐藤" }).map((x) => x.username)).toEqual(["sato"]);
});
```

- [ ] **Step 2: 落ちることを確かめる** Run: `pnpm vitest run --project web` / Expected: FAIL
- [ ] **Step 3: `filter.ts` を書いて通す**
- [ ] **Step 4: `users.spec.ts` を書く**（`auth.spec.ts` の後に流れる前提にせず、`beforeAll` で管理者のパスワード変更が済んでいなければ済ませる補助を `helpers.ts` に足す。serial）

```ts
test("ユーザーを作ると詳細に移り、作ったユーザーは初回ログインで変更を求められる", async ({ page, browser }) => {
  // /admin/users →「ユーザーを作成」→ 名前「佐藤 次郎」・sato・sato@example.test・仮のパスワード・実行者
  // →「作成する」を押した直後に toBeDisabled() → toHaveURL(/\/admin\/users\/[0-9a-f-]+$/) → 見出し「佐藤 次郎」
  // 別のコンテキストで sato でログイン → toHaveURL("/account/password")
});
test("使われているユーザー名は欄にエラーを出し、入力を残す", async ({ page }) => { /* sato をもう一度 */ });
test("一覧の人数のカードで絞り、URL に残る", async ({ page }) => {
  // 「パスワードの変更が必要」のカード → toHaveURL(/status=must-change/) → sato の行が見える → reload しても同じ
});
test("該当なしは0件の表示を出し、解除できる", async ({ page }) => { /* q=kimura →「絞り込みを解除」*/ });
test("ロールのスイッチで付与と剥奪がすぐ反映される", async ({ page }) => {
  // sato の詳細で「承認者」を on → reload → on のまま → off → reload → off
});
test("自分に作成者ロールを付けると、ヘッダのロールがすぐ変わる", async ({ page }) => {
  // admin の詳細で「作成者」を on → 自分のメニューに「管理者・作成者」
});
test("自分の詳細では管理者ロールを外せず、⋯ を出さない", async ({ page }) => {
  // 管理者のスイッチが disabled、理由の文が見える、「その他の操作」ボタンがない
});
test("パスワードを再設定すると、そのユーザーは次のログインで変更を求められる", async ({ page, browser }) => {});
test("無効化すると、そのユーザーはログインできない", async ({ page, browser }) => {
  // ⋯ →「無効化」→ ダイアログ「佐藤 次郎 を無効化しますか？」→「無効化する」→ 状態が「無効」
  // 別のコンテキストで sato → 「ログインできませんでした」
});
test("管理者でない人は管理の画面を開けず、メニューにも出ない", async ({ page, browser }) => {
  // 実行者だけのユーザーを作り、パスワード変更を済ませ、/admin/users →「このページを開く権限がありません」
});
```

  Run: `pnpm e2e` / Expected: 新しいテストが FAIL
- [ ] **Step 5: 画面を書く**（見た目は `frame.html` の S-13〜S-15 のとおり。ダイアログの文言もそこから写す）
  - S-13：`PageHeader`（「ユーザー」「ユーザーとロールを管理します」、「ユーザーを作成」）、人数のカード（押すと `status` を変える。選んでいるカードは強調）、検索欄（入力のたびに `q` を `replace` で更新）、行（頭文字の丸・名前とユーザー名・ロールのバッジ・状態の点）、読み込み中は `skeleton` の行を5つ、0件は「「{q}」に合うユーザーはいません」＋「絞り込みを解除」（`q` が空なら「該当するユーザーはいません」）。
  - S-14：`createUserRequestSchema` で React Hook Form。ロールは押して選ぶチップ。サーバーの `errors[].path` を `setError` で欄に出す。成功したら `/admin/users/$userId`。キャンセルは一覧へ。
  - S-15：パンくず、頭文字の丸・名前・状態・ユーザー名とメールアドレス、`RoleSwitches`（`PUT`／`DELETE /api/admin/users/{id}/roles/{role}`。失敗は `ErrorBanner` を出して取り直す）。自分なら管理者のスイッチを `disabled` にし「自分の管理者ロールは外せません」を添え、`UserActionsMenu` を出さない。`UserActionsMenu`：「パスワードを再設定」（`ResetPasswordDialog`、`passwordResetRequestSchema`）と区切り線の下に赤い「無効化」（`BanUserDialog`、すでに無効なら出さない）。「実行中の実行」の区画はまだ作らない。
  - 存在しない `$userId`（`NOT_FOUND`）は「ユーザーが見つかりません」の `EmptyState`。
- [ ] **Step 6: 通ることを確かめる** Run: `pnpm e2e`、`pnpm test`、`pnpm typecheck`、`pnpm lint` / Expected: すべて通る
- [ ] **Step 7: 見た目を確かめる**
  `pnpm dev` で S-13〜S-15・ダイアログ・読み込み中・0件をライトとダークで開き、`frame.html` と見比べる。
- [ ] **Step 8: Commit** `git commit -m "F-01 のユーザー管理の画面を作る"`

---

### Task 5: ドキュメントを今に合わせる

**Files:**
- Modify: `CLAUDE.md`（「現状」に画面の土台と F-01 の画面があること、コマンドの表に `pnpm e2e` と1ファイルの E2E（`pnpm --filter @tadori/web exec playwright test e2e/users.spec.ts`）、「構成」に `web/src` の主なファイル、「間違えやすい点」に Task 1〜4 で分かった注意（例：`routeTree.gen.ts` は生成物、E2E はテスト用 DB を空にするので `pnpm test` と同時に流さない））

- [ ] **Step 1: 書く**
- [ ] **Step 2: 確かめる** Run: `pnpm lint`、`pnpm test`、`pnpm e2e` / Expected: 通る
- [ ] **Step 3: Commit** `git commit -m "CLAUDE.md を画面の土台と F-01 の画面に合わせる"`
