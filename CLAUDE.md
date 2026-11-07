# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリの位置づけ

Tadori（手順書管理 Web アプリ）のアプリ本体。要件・設計は別リポジトリ [at0hs/tadori-docs](https://github.com/at0hs/tadori-docs) にあり、ローカルでは通常 `../tadori-docs/` に置かれている。

- 要件定義：`../tadori-docs/requirements.md`（機能要件 F-01〜F-10、各機能に受け入れ条件 AC）
- 設計：`../tadori-docs/design/`

実装・テストは要件 ID（F-xx）と AC に紐づけること。仕様の判断に迷ったら、推測で決めずに要件定義・設計を確認する。

## 現状

雛形と認証の骨組み（Better Auth・Drizzle・CSRF・IP の付け直し・初期管理者・`GET /api/me`）、F-01 の API（管理者の `/api/admin/users`、ロールの確認、操作ログ、復旧のコマンド）、画面の土台（ルーター・Query・shadcn/ui・テーマ・ログインの確認）と F-01 の画面（S-01、S-02、S-13〜S-16）、F-02・F-03 の手順書の API（`/api/procedures`）と画面（S-04〜S-09）、F-04〜F-06 の変数・実行・ステップの記録の API（`/api/executions`）と画面（S-10 実行の開始、S-11 実行の一覧、S-12 実行、S-15 の実行中の実行）、F-08 の承認・差し戻し・再依頼の API（`/api/executions/{id}/approve` など）と S-12 の操作、F-09 の Excel 出力の API（`GET /api/executions/{id}/export`）と S-12 の「Excel に出力」まである。ホーム（S-03）はまだない。画面の見た目と土台の決まりは `../tadori-docs/design/ui.md`（見た目の正本は `mockups/frame.html`、手順書の画面は `mockups/procedures.html`、実行の画面は `mockups/executions.html`）。基本設計は `../tadori-docs/design/README.md`、技術スタックとシステム構成は設計判断 D-10〜D-22 で決めた。

- TypeScript（Node.js 26 LTS、strict）、pnpm workspace で `server/`・`web/`・`shared/` に分ける。全部入りのフレームワークは使わない。
- `server/`：Hono、Drizzle（1.0。正式版がなければ最新の RC）、Better Auth（認証だけ。認可は自前）
- `web/`：Vite ＋ React、TanStack Router、TanStack Query、shadcn/ui（Base UI）＋ Tailwind CSS v4、TanStack Table、dnd-kit、CodeMirror 6、React Hook Form、react-markdown
- `shared/`：Zod スキーマ（画面と API の約束事の正本）、`#{name}` の解析・置換、秘密変数のマスク処理
- テストは Vitest（DB はモックせず、開発用とは別のテスト用 PostgreSQL）と Playwright。lint・フォーマットは Biome。ログは pino。CI は GitHub Actions。
- compose はアプリ・PostgreSQL・バックアップ用のコンテナ。秘密の値と初期管理者は `.env` で渡す（リポジトリには `.env.example` だけ）。HTTPS はアプリでは扱わない。

## コマンド

前提：Node.js 26、pnpm（`packageManager` の版に自動で合わせる）、Docker。初回は `.env.example` を `.env` に写す。

| やること | コマンド |
|---|---|
| 依存を入れる | `pnpm install` |
| 開発用・テスト用の DB を起動／停止 | `pnpm db:up` ／ `pnpm db:down` |
| 開発サーバー（API :3000 と画面 :5173。画面の `/api` は API に転送） | `pnpm dev` |
| 型チェック | `pnpm typecheck` |
| lint とフォーマットの確認／自動修正 | `pnpm lint` ／ `pnpm format` |
| テスト（全部） | `pnpm test`（テスト用 DB が要る。先に `pnpm db:up`） |
| テスト（1ファイル） | `pnpm vitest run server/src/auth/routes.test.ts` |
| テスト（名前で絞る） | `pnpm vitest run -t "F-01 AC"` |
| テスト（パッケージで絞る） | `pnpm vitest run --project server` |
| E2E（全部） | `pnpm e2e`（テスト用 DB が要る。`pnpm test` と同時に流さない） |
| E2E（1ファイル） | `pnpm --filter @tadori/web exec playwright test e2e/users.spec.ts` |
| 画面のビルド | `pnpm build` |
| マイグレーションの生成 | `pnpm --filter @tadori/server exec drizzle-kit generate --name <内容>` |
| 管理者の復旧（D-51） | `pnpm --filter @tadori/server recover-admin <ユーザー名>`（仮のパスワードを標準エラー出力に出す） |

CI（`.github/workflows/ci.yml`）は push と PR で、型チェック・`biome ci`・テスト・ビルド・E2E を流す。

## 構成

ディレクトリの役割と依存の向きは `../tadori-docs/design/conventions.md` の 1〜2章に従う。今あるものは次のとおり。

- `server/src/index.ts`：起動。マイグレーション → 初期管理者（ユーザーが0人のときだけ）→ 待ち受け。
- `server/src/app.ts`：Hono のアプリ。ミドルウェアは**登録した順に効く**。リクエスト ID と IP → CSRF → `/api/auth/*` → `requireSession` → `/api/me` → `requirePasswordChanged` → 機能のルートの順で、機能のルートは一番下に足す。
- `server/src/auth/`：Better Auth を使うのはここだけ。入口の許可リスト（`routes.ts`）、IP の付け直し（`client-ip.ts`、D-60）、セッションの取得（`session.ts`）、ユーザーの作成・無効化・パスワードの設定・復旧（`users.ts`）。ログインの操作ログは `auth.ts` の after フックで出す。
- `server/src/middleware/`：リクエスト ID と IP（`request-context.ts`）、CSRF（`csrf.ts`、D-61）、ログインとパスワード変更の確認（`session.ts`）、ロールの確認（`role.ts` の `requireRole`）。
- `server/src/features/users/`：管理者の API（`routes.ts`・`service.ts`）、初期管理者、復旧（`recover.ts`。入口は `server/src/cli/recover-admin.ts`）。
- `server/src/features/procedures/`：手順書・版・下書きの API。読み込み（`read-service.ts`）と書き込み（`write-service.ts`。楽観ロックの照合は `checkLock`）、共有の読み出し（`queries.ts`）。
- `server/src/features/executions/`：実行の API。開始（`start-service.ts`）、詳細と一覧（`read-service.ts`）、変数・ステップの状態・コメント・エビデンス（`record-service.ts`）、終了と中止（`end-service.ts`）、行のロック・本人の確認・変数の照合・管理者が中止できるかの判定（`queries.ts`）、Excel 出力（`export-service.ts`。ブックの組み立ては `export-workbook.ts` で、ExcelJS を使うのはここだけ（D-63）。ファイル名と日時は `export-format.ts`）。ExcelJS の依存の uuid は `pnpm-workspace.yaml` の `overrides` で上げている。
- `server/src/features/approvals/`：承認・差し戻し・再依頼の API（`service.ts`・`routes.ts`）。`/api/executions` の下に載せ、実行の行のロックと本人の確認は `features/executions/queries.ts` を使う。
- `server/src/db/`：テーブル定義（`schema/`）、接続（`client.ts`）、マイグレーション（`migrate.ts`）。生成した SQL は `server/drizzle/`。
- `server/src/lib/`：`AppError` と Problem Details（`errors.ts`）、pino（`logger.ts`）、操作ログ（`operation-log.ts`）、本文とパスの検証（`validate.ts` の `jsonBody`・`pathParams`）、Hono の型とサービスに渡す `Operator`（`hono.ts`）。
- `server/test/`：テストの環境変数・DB の準備・補助関数。手順書のダミーの文書と、DB に直接入れる補助は `procedures.ts`。出力した .xlsx の読み直しは `xlsx.ts` の `readXlsx`。
- `shared/src/`：エラーコード（`errors/`）、Zod スキーマ（`schemas/`。手順書の文書 `ProcedureContent` と公開時の検証 `findPublishErrors` は `procedures.ts`、実行の約束事と終了の判定 `finishOutcome`・進捗 `progressOf` は `executions.ts`）、`#{name}` の解析（`variables/parse.ts`）と置換・マスク（`variables/substitute.ts` の `splitVariables`・`maskSecrets`、サーバーの出力用の `substituteText`）、UUID v7 の ID（`ids.ts` の `newId`）。
- `web/src/routes/`：TanStack Router のルート（ファイルの並びが URL）。`_app.tsx` がログインの確認（未ログインは `/login?redirect=…`、パスワード変更が必要なら `/account/password`）と共通の枠。`routeTree.gen.ts` は Vite のプラグインが作る生成物（コミットする。Biome の対象外）。
- `web/src/lib/`：API のクライアントとエラー（`api.ts` の `api`・`ApiError`）、画面全体に効くエラーの動き（`query.ts`）、`redirect` の検証、Better Auth のクライアント（`auth-client.ts`）、メニューの項目（`nav.ts`）、ロールの表示名（`roles.ts`）、テーマ（`theme.ts`。`index.html` にも同じ規則のスクリプトがある）。
- `web/src/components/`：共通の枠（`app-shell.tsx`）、見出し・0件・エラーの帯・入力欄などの部品。`ui/` は shadcn の部品。
- `web/src/features/`：機能ごとの部品と Query（`me/`、`auth/`、`users/`、`procedures/`、`executions/`）。手順書の編集画面は `procedures/editor/`（フォームの本体 `procedure-editor.tsx`、CodeMirror の欄 `variable-field.tsx`、ステップのカードと並べ替え `step-list.tsx`）。
- `web/src/features/executions/`：秘密変数の値の置き場（`secret-store.ts`。モジュールの中の `Map` だけ。ほかのコードは `getSecrets`・`setSecrets`・`useSecrets`・`clearSecrets` で触る。ログアウトとセッション切れで消す）、表示・コピー・入力のマスク（`render.ts`）、S-10（`start-form.tsx`）、S-12（`execution-page.tsx`・`step-card.tsx`・`execution-rail.tsx`・`execution-dialogs.tsx`）、S-11（`execution-list.tsx`・`filter.ts`）、S-12 の見出しに出す承認の操作の判定（`approval-action.ts`）、Excel のダウンロードと「Excel に出力」の置き場所（`download.ts`）。
- `web/e2e/`：Playwright。`setup.ts` が初期管理者のパスワードを変え、ログイン状態（`e2e/.auth/admin.json`）を他のテストが使い回す。API は `server/test/e2e-server.ts` がテスト用 DB を空にしてから起動する（:3100、画面は :5174）。
- `compose.dev.yaml`：開発用 DB（:5433、ボリュームあり）とテスト用 DB（:5434、tmpfs）。本番用の `compose.yaml` はまだない。

## 間違えやすい点

- **server と shared はビルドしない**。Node 26 が `.ts` を直接動かす（型を消すだけ）。そのため相対 import には `.ts` の拡張子を付け、`enum`・`namespace`・コンストラクタの引数でのプロパティ宣言など、型を消すだけでは動かない書き方は使わない（`erasableSyntaxOnly`）。
- **TypeScript 7** では `Response.json()` が `unknown` を返す。テストでは `test/helpers.ts` の `readJson` を使う。
- **Drizzle は 1.0 の RC**。`drizzle()` には `schema` ではなく `relations` を渡す。アプリのテーブルは `snakeCase.table(...)` で定義する（列名が snake_case になる）。時刻の列は必ず `timestamp({ withTimezone: true })`。
- **Better Auth のテーブル**（`db/schema/auth.ts`）は CLI の出力を書き換えたもの。Better Auth の版を上げて生成し直したら、時刻の列を `timestamptz` に直す（D-59。直し忘れは `schema.test.ts` が見つける）。
- **Better Auth の入口を増やすときは `auth/routes.ts` の許可リストに書く**。書かない限り 404 になる。`auth.api.createUser` は `headers` なしで呼ぶと権限を確かめないので、呼ぶ前にアプリの認可を通す。
- **適用済みのマイグレーションは書き換えない**。テーブル定義を直したら新しいマイグレーションを生成する。`server/drizzle/` は生成物なので Biome の対象外にしている。
- **サービスは `Context` を受け取らない**。ルートで `operatorOf(c)` を呼び、操作する人・リクエスト ID と IP・Better Auth に渡すヘッダをまとめた `Operator` を渡す。操作ログは `logOperation(op.meta, …)` で、コミットした後に出す。
- **ルートの検証**は `lib/validate.ts` の `jsonBody(schema)`・`pathParams(schema)` を使う（JSON でなければ 415、合わなければ 400 と欄ごとの `errors`。パスが合わなければ 404）。hono/validator を通すので、Hono RPC で画面に入力の型が伝わる。
- **API のテスト**は `test/helpers.ts` の `request()` で呼ぶ。状態を変えるリクエストに `Origin` を付け（付けないと CSRF で 403）、接続元の IP をソケットの代わりに渡す（付けないとログインの回数制限が共有される）。操作ログは `captureOperationLogs()`、D-33 の食い違いは `adminColumnMismatches()` で確かめる。
- **テストの DB**：server のテストはテスト用 DB を1つ共有し、ファイルを並べて流さない。Better Auth はアプリのトランザクションに参加できないので、認証を使うテストは `resetDb()` でテーブルを空にして分ける（ロールバックによる分離は、サービスのテストを書くときに用意する）。
- **E2E の注意**：`test.use({ storageState })` は `browser.newContext()` にも引き継がれる。別の人として操作するときは `e2e/helpers.ts` の `freshPage()` を使う。`e2e/` の tsconfig には DOM の型がないので、`page.evaluate` でブラウザの API を使うときは式を文字列で渡す（例：クリップボード）。`setupAuthor` の作成者（author1・author2）は `procedures.spec.ts` が作るので、ほかのファイルでは別のユーザー名で作る（`executions.spec.ts` は runner1、`approvals.spec.ts` は apprunner・checker1。`approvals.spec.ts` は管理者に承認者ロールを一時的に付けて外す）。Better Auth はパスワードの変更を IP ごとに 10 秒 3 回までにしているので、1つのファイルで新しいユーザーを作るのは2人までにする。入力欄は `getByLabel(…, { exact: true })` で探す（検索欄などと部分一致する）。ログインは IP ごとに 60 秒 20 回の制限があるので、管理者のログインは使い回す。
- **pnpm は出てから24時間たっていない版を入れない**（`minimumReleaseAge`）。新しすぎる版を指定すると、pnpm が `pnpm-workspace.yaml` に `minimumReleaseAgeExclude` を自動で書き足すことがある。これはコミットせず、24時間待つか1つ前の版にする。

## 画面の実装ルール

- **色は `web/src/index.css` の CSS 変数だけで指定する**（D-62）。`bg-white`・`text-emerald-600` などを部品に直接書かない。成功・警告は `success`・`warning`、ヘッダは `chrome`。テーマ色は `--brand-hue` の1つで、ライトとダークの両方の値を決めて確かめる。
- **画面の移動はリンクにする**。見た目をボタンにするときは `<Link className={buttonVariants()}>` と書く（`<Button render={<Link />}>` は役割がボタンになる）。
- **API は `lib/api.ts` の `api` で呼ぶ**（例：`api.admin.users.$get()`）。エラーは `ApiError` で届き、未ログイン・パスワード変更が必要の移動は `lib/query.ts` が行う。ログイン・ログアウト・自分のパスワードの変更だけは `authClient` を使う。
- **`me` を変える操作の後は `invalidateQueries` で取り直す**。`removeQueries` では表示中のヘッダに伝わらない。
- **`useFieldArray` は `keyName: "fieldKey"` にする**。既定の `id` は、ステップの `id`（記録の紐づけに使う）を上書きしてしまう。
- **入力中の内容を残したい mutation には `meta: { keepOnUnauthenticated: true }` を付ける**（編集画面の保存など）。付けると、セッション切れでもログイン画面へ移さず、画面がエラー（`UNAUTHENTICATED`）を受け取る。
- **編集画面に読み込む下書き（`draftQueryOptions`）は `gcTime: 0`**。開くたびに最新を読み、古い `revision` で編集を始めない。
- E2E で CodeMirror の補完を Enter で確定するときは、候補が出てから 75ms（`interactionDelay`）以上待つ。
- UI 部品は `web/` の `components/ui/`（shadcn からコピーした汎用の部品）にあるものを使う。ネット上のサンプルをそのまま貼らない。
- shadcn/ui は **Base UI** ベース。部品の組み合わせは `render` プロパティで書き、Radix の `asChild` は使わない。部品ごとの引数も Radix と違うことがあるので、`components/ui/` の実装を確認してから使う。
- Enter キーで何かを実行する処理（送信、タグの追加、候補の確定など）では、日本語の変換中（`event.nativeEvent.isComposing`）なら何もしない。
- **秘密変数の値**は `features/executions/secret-store.ts` の置き場だけに置き、API・Query のキャッシュ・Web Storage・URL に入れない。実行者が入力したテキストは送る前に `maskInput` を通す。表示は `ExecText`（値は薄いテーマ色、秘密変数は `●●●●`）、コピーは `textForCopy`（値が置き場になければ `null`）。
- **実行の操作の mutation は成功・失敗のどちらでも `["executions"]` を取り直す**。`STEP_STATUS_CONFLICT`・`STATE_CONFLICT` のときに最新を見せるため。エラーは S-12 の見出しの下の帯に出す（ダイアログは閉じる）。ただし差し戻し・再依頼のダイアログは、書いたコメントを残すため、`STATE_CONFLICT`・`FORBIDDEN`・`NOT_FOUND` 以外（サーバーのエラー・通信の失敗・セッション切れ）ではダイアログを開いたまま中にエラーを出す。`STEP_STATUS_CONFLICT` の今の状態は `currentStatus`（Problem Details の `status` とぶつかるため）。
- **入力中のフォームの元になる Query は、取り直しで黙って作り直さない**。S-10 は開いた版に固定し、「最新版で開き直す」でだけ切り替える（ウィンドウのフォーカスで取り直すと入力が消えるため）。

## 崩してはいけない不変条件

- **テンプレートとインスタンスの分離**：手順書（版）と実行は別物。実行は開始時の版に固定され、後から新しい版が公開されても内容は変わらない。実行手順書は「版＋変数の値」から再現できる。
- **版管理**：下書きは手順書ごとに最大1つ。保存しても版数は上がらず、公開時だけ上がる（変更理由必須）。公開済みの版はどの操作でも変更できない。アーカイブした手順書からは実行を開始できない。
- **下書きの楽観ロック**：保存・公開は、読み込んだ時点の `revision` と照合する。下書きがない状態から始めた場合は、「今も下書きがない」ことに加えて、読み込んだ版数が今の最新の版数と同じことも確かめる（D-55）。どちらも違えば上書きせずにエラーにする。
- **変数**：`#{変数名}` 形式で、ステップのタイトル・説明・コマンド・確認方法の中で置換する（`##{変数名}` はエスケープ、規則に合わない `#{...}` はそのままの文字列）。最初のステップの状態を更新した後は値を変更できない。未定義の変数を参照していると公開時にエラーにする。
- **秘密変数**：値はサーバーに送らず、DB にも保存しない（ブラウザの中だけで保持し、再開時に入力し直す）。実行者が入力するテキスト（エビデンス・コメント・スキップの理由・中止の理由・再依頼のコメント）は、送る前にブラウザ側で秘密変数の値をマスクする（D-02、D-56）。画面ではマスク表示し、Excel 出力・操作ログ・実行記録の表示に平文で出さない（AC の検証対象）。
- **応答に含めてよい情報**：下書き・未公開の手順書は作成者ロールの人にだけ返す。記録の中の他のユーザーは ID と名前だけを返す。その他の決まりは `../tadori-docs/design/api.md` の 3章に従い、テストで確かめる（D-49）。
- **実行の終了**：ステップの状態は実行中なら自由に変更でき、すべて履歴に残す。実行は「終了する」操作で明示的に終わらせ、自動では終了しない。完了条件と進捗には「手順」のステップだけを数え（進捗の完了数には完了とスキップを数える、D-57）、切り戻しのステップを1つでも実施したら異常終了にする。
- **認可**：ロール（管理者／作成者／実行者／承認者／閲覧者。複数付与可、システム全体で共通）は画面だけでなく API でも検証する。実行への操作（ステップの状態の変更、追記、終了、中止、再依頼など）ができるのは「本人」（その実行を開始し、操作の時点で実行者ロールを持つ人、D-35）だけ。ロールはリクエストのたびに DB から読む。
- **職務分離**：自分が実行者である実行は承認・差し戻しできない。承認済みの実行記録は誰も変更できない。差し戻し後に追記できるのはコメントとエビデンスだけで、ステップの状態は変更できない。
- **ユーザーは物理削除しない**（無効化のみ）。記録との紐づけを保つため。
- **ログの二層構造**：操作ログ（F-10）は JSON 構造化ログとして標準出力へ出す（DB には保存しない）。ステップ単位の「誰が・いつ・何から何に変えたか」は実行記録として DB に保存する。
- **状態遷移**は要件定義「4.1 状態遷移」に従う（実行：実行中→完了／異常終了／中止、承認：承認待ち→承認済み／差し戻し→承認待ち）。

## 非機能・制約

- `docker compose up` だけで起動できること（アプリ＋PostgreSQL）。
- 時刻は UTC で保存し、日本時間で表示する。UI は日本語のみ。対象ブラウザは PC 版の最新 Chrome / Edge。
- 認証は自作せず、実績のあるライブラリを使う。将来 OIDC による SSO を追加できる構造にする。初期管理者には初回ログイン時にパスワードを変更させる。
- **開発・動作確認にはダミーデータだけを使う**。実在のホスト名、IP、認証情報、業務・顧客の情報をコード・テスト・シードデータに入れない。
- MVP でやらないこと（差分表示、画像添付、複数人での分担、SSO/MFA、コマンドの自動実行など）は要件定義「6. 非目標」を参照し、勝手にスコープを広げない。
