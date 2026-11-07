# 本番用の構成（compose・Dockerfile・バックアップ）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.env` を書いて `docker compose up -d` だけで app・db・backup が動き、バックアップ・復元・復元の確認・管理者の復旧を1行のコマンドでできるようにする。

**Architecture:** server に画面の静的配信を足し（`/api` 以外は `web/dist`、なければ `index.html`）、2段ビルドのイメージにする。backup は `postgres:18` にシェルのスクリプトを足したイメージで、`BACKUP_TIMES` の時刻まで待ってダンプを取ることを繰り返す。手で使うコマンドも backup のイメージに入れる。

**Tech Stack:** Node 26・pnpm・Hono（`@hono/node-server/serve-static`）、Docker Compose、`postgres:18`、bash、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-11-08-production-compose-design.md`

## Global Constraints

- ブランチは `feat/production-compose`。最初のコミットで spec とこの計画を入れる。
- イメージ：db と backup は `postgres:18`（D-53）。app は `node:26` 系。
- 既定値：`APP_PORT=3000`、`BACKUP_TIMES=03:00`、`BACKUP_KEEP=7`、backup の `TZ=Asia/Tokyo`。
- 必須：`POSTGRES_PASSWORD`・`BETTER_AUTH_SECRET`・`APP_URL`（compose で `${VAR:?…}`）。
- ダンプ：`pg_dump -Fc`、名前は `tadori-YYYYMMDD-HHMMSS.dump`（日本時間）、自動は `backups/auto/`、手は `backups/manual/`、世代の削除は `auto/` だけ。ファイルは所有者だけが読める（umask 077）。
- 断るダミーの秘密鍵：`dev-secret-dev-secret-dev-secret-0123456789`（`NODE_ENV=production` のときだけ）。
- `server/` と `shared/` はビルドしない。イメージでもワークスペースのシンボリックリンクを保つ（`pnpm deploy` は使わない）。
- `*.sh` と `backup/bin/*` は LF（`.gitattributes`）。
- 実在のホスト名・IP・認証情報は使わない（`.env` の値もダミー）。

## Review Focus

1. 画面の URL を直接開く・再読み込みする（`/executions/<id>`）→ `index.html` が返り、画面が開く。`/api/nope` は API の 404（JSON）のままで、`index.html` にならない。→ Task 2 のテスト
2. `/../.env` や `/%2e%2e/` のような上の階層を指す URL → `web/dist` の外のファイルは返らない。→ Task 2 のテスト
3. `BACKUP_TIMES` に空白・重複・並びが逆の値（`15:00, 03:00,03:00`）→ 受け付けて並べ直す。`3:00`・`24:00`・`03:60`・空 → 起動時にエラーで止まる。→ Task 4 のテスト
4. いまちょうど実行の時刻（03:00:00）→ 同じ時刻に2回取らず、次の時刻まで待つ。日付をまたぐ（23:59 → 翌 03:00）。→ Task 4 のテスト
5. `pg_dump` が途中で失敗する → 書きかけは残らず、世代の削除も起きない。→ Task 4 のテスト（`rotate` は `.tmp` を数えない）と Task 4 の手での確認（db を止めて取る）

---

### Task 1: 環境変数の追加とダミーの秘密鍵を断る

**Files:**
- Modify: `server/src/config.ts`
- Create: `server/src/config.test.ts`

**Interfaces:**
- Produces: `parseConfig(env: Record<string, string | undefined>): Config`（誤りなら `Error` を投げる）。`Config` に `WEB_DIST_DIR?: string` と `NODE_ENV?: string` が増える。`config` は今までどおり `parseConfig(process.env)` の結果。

- [ ] **Step 1: テストを書く**（`config.test.ts`、`describe("config")`）
  - 必要な値だけで通り、`WEB_DIST_DIR` は `undefined`。
  - `NODE_ENV: "production"` と `BETTER_AUTH_SECRET: "dev-secret-dev-secret-dev-secret-0123456789"` → `toThrow(/BETTER_AUTH_SECRET/)`。
  - `NODE_ENV` を付けずに同じ秘密鍵 → 通る（開発の `.env` を壊さない）。
  - `WEB_DIST_DIR: "/app/web/dist"` → そのまま入る。
- [ ] **Step 2:** `pnpm vitest run server/src/config.test.ts` → `parseConfig` がないので FAIL
- [ ] **Step 3:** `parseConfig` を切り出し、schema に `WEB_DIST_DIR: z.string().min(1).optional()`・`NODE_ENV: z.string().optional()` を足す。`superRefine`（またはパース後の確認）で、本番のときにダミーの値を断る。メッセージは「BETTER_AUTH_SECRET が .env.example のダミーの値のままです。作り直してください（例：openssl rand -base64 32）」。
- [ ] **Step 4:** 同じコマンドで PASS。`pnpm typecheck` も通る。
- [ ] **Step 5:** コミット `server: 本番でダミーの秘密鍵を断り、画面の置き場を受け取る`

### Task 2: 画面の静的配信

**Files:**
- Create: `server/src/web-static.ts`、`server/src/web-static.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `app`（`server/src/app.ts`。`basePath("/api")` 付き）、`config.WEB_DIST_DIR`
- Produces: `createRootApp(options: { api: { fetch: (req: Request, ...rest: never[]) => Response | Promise<Response> }; distDir?: string }): Hono`。`/api` と `/api/*` は `api.fetch` にそのまま渡す（API の `notFound`・`onError` を保つ）。`distDir` がなければ `/api` 以外はすべて 404。

- [ ] **Step 1: テストを書く**（一時ディレクトリに `index.html`（`<p>index</p>`）と `assets/app-abc123.js` を作り、`api` には `/api/health` で `{status:"ok"}`、他は 404 の JSON を返す小さな Hono を渡す）
  - `GET /` → 200、本文に `index`、`Cache-Control` に `no-cache`。
  - `GET /executions/0190-xyz`（ファイルなし）→ 200 で `index.html`、`no-cache`。
  - `GET /assets/app-abc123.js` → 200、`Cache-Control: public, max-age=31536000, immutable`。
  - `GET /assets/missing.js` → 404（`assets/` の下は `index.html` を返さない）。
  - `GET /api/health` → 200 の JSON。`GET /api/nope` → 404 で `Content-Type` が JSON（`index.html` ではない）。
  - `GET /../secret.txt`・`GET /%2e%2e/secret.txt`（一時ディレクトリの親に `secret.txt` を置く）→ 本文に secret の中身が入らない。
  - `distDir` なし → `GET /` が 404。
  - `POST /anything`（`/api` 以外）→ 404。
- [ ] **Step 2:** `pnpm vitest run server/src/web-static.test.ts` → FAIL
- [ ] **Step 3:** 実装。`@hono/node-server/serve-static` の `serveStatic({ root: distDir })` を使い、`onFound` で `assets/` の下と `index.html` に上の `Cache-Control` を付ける。フォールバックは `serveStatic({ path: "index.html" })` 相当。`index.ts` は `serve({ fetch: createRootApp({ api: app, distDir: config.WEB_DIST_DIR }).fetch, … })` にする。
- [ ] **Step 4:** PASS。`pnpm test --project server` と `pnpm typecheck` も通る（`AppType` は `app` のまま変えない）。
- [ ] **Step 5:** コミット `server: ビルドした画面を配信する（D-10）`

### Task 3: app のイメージと compose（app・db）

**Files:**
- Create: `Dockerfile`、`.dockerignore`、`compose.yaml`
- Modify: `.env.example`

**Interfaces:**
- Produces: compose のサービス `app`（`WEB_DIST_DIR=/app/web/dist`、`NODE_ENV=production`、`DATABASE_URL=postgres://tadori:${POSTGRES_PASSWORD}@db:5432/tadori`、`PORT=3000`）と `db`（ボリューム `db-data:/var/lib/postgresql`）。ログの設定は `x-logging` のアンカーにして Task 4 の backup でも使う。

- [ ] **Step 1:** `Dockerfile`。build 段：`corepack` で `packageManager` の pnpm を使い、`pnpm install --frozen-lockfile` → `pnpm build`。runtime 段：ルートの `package.json`・`pnpm-lock.yaml`・`pnpm-workspace.yaml`・各パッケージの `package.json` を写して `pnpm install --prod --frozen-lockfile --filter @tadori/server...`、`server/`（`drizzle/` を含む）・`shared/`・build 段の `web/dist` を写す。`USER node`、`CMD ["node", "server/src/index.ts"]`、`HEALTHCHECK` は `node -e` で `http://127.0.0.1:3000/api/health` を `fetch`。
- [ ] **Step 2:** `.dockerignore`：`node_modules`、`**/node_modules`、`.env`、`backups`、`web/dist`、`.git`、`**/test-results`、`**/playwright-report`、`.superpowers`、`docs`。
- [ ] **Step 3:** `compose.yaml`（app・db）。app のポートは `"${APP_PORT:-3000}:3000"`。app は `depends_on: db: condition: service_healthy`。どちらも `restart: unless-stopped`。`.env.example` に `POSTGRES_PASSWORD`・`APP_PORT`・`BACKUP_TIMES`・`BACKUP_KEEP` を足し、本番で書き換える値と開発だけの値（`DATABASE_URL`・`PORT`）を説明で分ける。
- [ ] **Step 4: 動かして確かめる**（scratchpad に本番用のダミーの env を作り `--env-file` で渡す。秘密鍵はダミー以外）
  - `docker compose --env-file <tmp>/.env up -d --build --wait` → 成功。
  - `curl -fsS localhost:3000/api/health` → `{"status":"ok"}`。`curl -s localhost:3000/executions/x` → `<div id="root">` を含む。
  - 一時的な Playwright のスペック（コミットしない、`baseURL` を :3000）で初期管理者でログイン→パスワード変更→ホームが開く。スクリーンショットを Read で見る。
  - 秘密鍵をダミーの値にして `up` → app が止まり、`docker compose logs app` に Task 1 のメッセージ。
  - `docker compose exec app node server/src/cli/recover-admin.ts <初期管理者>` → 仮のパスワードが出る。
  - `docker compose down`（`-v` は付けず、確かめ終えたら `docker volume rm` で一時的なボリュームを消す。プロジェクト名は `-p tadori-check` にして開発の DB と分ける）。
- [ ] **Step 5:** コミット `app のイメージと本番用の compose（app・db）を足す`

### Task 4: バックアップ（毎日・その場で）

**Files:**
- Create: `backup/Dockerfile`、`backup/lib.sh`、`backup/bin/tadori-scheduler`、`backup/bin/tadori-backup`、`backup/test/lib.test.sh`、`.gitattributes`
- Modify: `compose.yaml`（backup を足す）

**Interfaces:**
- Produces（`lib.sh` の関数。すべて `TZ` に従う）：
  - `parse_times <BACKUP_TIMES>`：`HH:MM`（00–23・00–59、2桁）を空白を除いて検証し、並べて重複を除き1行ずつ出す。誤りや空なら標準エラーに理由を出して 1。
  - `validate_keep <BACKUP_KEEP>`：1以上の整数でなければ 1。
  - `seconds_until_next <now_epoch> <時刻…>`：次の実行までの秒（1以上）。今日の時刻のうち `now` より後の最初のもの、なければ翌日の最初の時刻。ちょうど同じ時刻は「後」に含めない。
  - `dump_to <dir>`：`<dir>/.tadori-<日時>.dump.tmp` に `pg_dump -Fc` し、成功したら `tadori-<日時>.dump` に名前を変えて、そのパスを出す。失敗したら一時ファイルを消して 1。
  - `rotate <dir> <keep>`：`tadori-*.dump`（`.tmp` は数えない）を名前の順に並べ、新しい `keep` 個を残して消す。
  - `tadori-backup`（引数なし）：`manual/` に `dump_to`。`tadori-scheduler`：起動時に検証し次の時刻をログに出す → 待つ → `auto/` に `dump_to` → 成功したときだけ `rotate auto $BACKUP_KEEP` → 繰り返す。

- [ ] **Step 1: テストを書く**（`backup/test/lib.test.sh`。`TZ=Asia/Tokyo`。小さな `assert_eq` を置き、失敗が1つでもあれば 1 で終わる）
  - `parse_times "15:00, 03:00,03:00"` → `03:00\n15:00`。
  - `parse_times` が `3:00`・`24:00`・`03:60`・`""`・`03:00,,` で 1。
  - `validate_keep` が `7` で 0、`0`・`-1`・`a`・`""` で 1。
  - `seconds_until_next`：2026-11-08 02:59:00 JST と `03:00` → 60。03:00:00 と `03:00` → 86400。23:59:00 と `03:00` → 10860。14:00:00 と `03:00 15:00` → 3600。
  - `rotate`：一時ディレクトリに `tadori-20261101-030000.dump`〜`tadori-20261109-030000.dump`（9個）と `.tadori-20261110-030000.dump.tmp` を置き、`rotate dir 7` → 古い2個だけ消え、`.tmp` は残る。
- [ ] **Step 2:** `backup/Dockerfile`（`FROM postgres:18`、`lib.sh` と `bin/` を `/opt/tadori` と `/usr/local/bin` に写す、`test/` も写す、`ENTRYPOINT ["tadori-scheduler"]`）と空の関数だけの `lib.sh` を作り、`docker build -t tadori-backup-test backup && docker run --rm --entrypoint bash tadori-backup-test /opt/tadori/test/lib.test.sh` → FAIL
- [ ] **Step 3:** `lib.sh` の関数と `bin/` の2つを実装する。接続は `PGHOST=db`・`PGUSER=tadori`・`PGDATABASE=tadori`・`PGPASSWORD`（compose から）。`umask 077`。ログは1行ずつ「日時 内容」を標準出力に、失敗は標準エラーに出す。`.gitattributes` に `*.sh text eol=lf` と `backup/bin/* text eol=lf`。
- [ ] **Step 4:** 同じコマンドで PASS。
- [ ] **Step 5:** compose に backup を足す（`build: ./backup`、`./backups:/backups`、`TZ=Asia/Tokyo`、`BACKUP_TIMES: ${BACKUP_TIMES:-03:00}`、`BACKUP_KEEP: ${BACKUP_KEEP:-7}`、db の healthy を待つ、`restart: unless-stopped`、ログの設定）。
- [ ] **Step 6: 動かして確かめる**（Task 3 と同じ一時的なプロジェクト）
  - `BACKUP_TIMES` を今から1〜2分後にして `up` → ログに次の時刻 → その時刻に `backups/auto/` にダンプができる。
  - `BACKUP_KEEP=2` で3回取れるよう時刻を3つ並べ → `auto/` が2個になる。
  - `docker compose exec backup tadori-backup` → `backups/manual/` にでき、`auto/` の数は変わらない。
  - `BACKUP_TIMES=25:00` → backup が止まり、ログに理由。
  - `docker compose stop db` の後で `tadori-backup` → 失敗を出し、`manual/` に `.tmp` が残らない。
- [ ] **Step 7:** コミット `backup: 決まった時刻のバックアップとその場で取るコマンド（D-19）`

### Task 5: 復元の確認と復元

**Files:**
- Create: `backup/bin/tadori-verify`、`backup/bin/tadori-restore`
- Modify: `backup/lib.sh`（`latest_dump` を足す）、`backup/test/lib.test.sh`

**Interfaces:**
- Consumes: Task 4 の `lib.sh`
- Produces：
  - `latest_dump <backups_dir>`：`auto/` と `manual/` の `tadori-*.dump` のうち名前の日時が一番新しいもののパス。なければ 1。
  - `tadori-verify [ダンプ]`：一時ディレクトリに `postgres` ユーザーで `initdb`・`pg_ctl start`（ソケットだけ、ポートは開かない）→ root で読んだダンプを標準入力から `pg_restore --no-owner -d` → `user`・`procedures`・`procedure_versions`・`executions` の件数を出す → 止めて消す。どこかで失敗したら 1。
  - `tadori-restore <ダンプ> [--yes]`：`pg_stat_activity` に `tadori` DB への自分以外の接続があれば「app を止めてから実行してください（docker compose stop app）」で 1。`--yes` がなければ `yes` の入力を求める。`postgres` DB につないで `DROP DATABASE tadori` → `CREATE DATABASE tadori OWNER tadori` → `pg_restore --no-owner -d tadori`。

- [ ] **Step 1:** テストを足す：`latest_dump` が `auto/` の `20261108-030000` と `manual/` の `20261108-101500` から manual を返す。どちらも空なら 1。テーブル名は `server/src/db/schema/` で確かめてから決める。
- [ ] **Step 2:** FAIL を確かめる → 実装 → PASS。
- [ ] **Step 3: 動かして確かめる**
  - Task 3 の画面で手順書を1つ作って公開し、`tadori-backup` → `docker compose run --rm backup tadori-verify` → 件数（手順書 1）が出て、動いている db は無傷。
  - app を動かしたまま `docker compose exec backup tadori-restore <ダンプ> --yes` → 断られる。
  - 手順書をもう1つ公開 → `stop app` → `tadori-restore <ダンプ> --yes` → `start app` → 画面で手順書が1つに戻っている。
- [ ] **Step 4:** コミット `backup: 復元の確認（D-54）と復元のコマンド`

### Task 6: CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1:** ジョブ `compose` を足す（`check` と並べて動かす）：ダミーの `.env` を書く（`POSTGRES_PASSWORD`・`BETTER_AUTH_SECRET` は CI 用の値、`APP_URL=http://localhost:3000`、`INITIAL_ADMIN_*`）→ `docker compose up -d --build --wait` → `curl -fsS localhost:3000/api/health` → `curl -fsS localhost:3000/ | grep 'id="root"'` → `docker compose run --rm --entrypoint bash backup /opt/tadori/test/lib.test.sh` → `docker compose exec -T backup tadori-backup` → `docker compose run --rm backup tadori-verify`（`user` が 1）→ 失敗したら `docker compose logs`。
- [ ] **Step 2:** push して CI が通ることを確かめる（Task 7 の後にまとめて push してもよい）。
- [ ] **Step 3:** コミット `ci: 本番の構成を起動してバックアップと復元の確認まで流す`

### Task 7: 文書

**Files:**
- Modify: `CLAUDE.md`（tadori）、`../tadori-docs/requirements.md`（5章のバックアップ）、`../tadori-docs/design/decisions.md`（D-19）、`../tadori-docs/design/operations.md`（2.1・3・5・6・8・10章）

- [ ] **Step 1:** operations.md を、Task 3〜5 で実際に動かしたコマンドで書き直す（変数の正式な名前と既定値、`BACKUP_KEEP` はファイルの数、`POSTGRES_PASSWORD` は英数字、`tadori-backup`・`tadori-verify`・`tadori-restore`・`recover-admin` のコマンド、ログの上限の値）。
- [ ] **Step 2:** requirements.md 5章を「既定では1日1回 `pg_dump` を取得し、DB とは別の場所に7世代保管する。頻度と世代は設定で変えられる」に。D-19 に時刻と世代を `.env` で変えられること・案 A を採ったことを足す。
- [ ] **Step 3:** tadori の CLAUDE.md の「現状」「構成」（`web-static.ts`・`backup/`・`compose.yaml`）「コマンド」を更新する。
- [ ] **Step 4:** tadori はコミット `文書：本番の構成を CLAUDE.md に書く`。tadori-docs はユーザーに確認してからコミット・push する。
- [ ] **Step 5:** Opus のエージェントでブランチ全体をレビューし、直す。push → PR → CI → ユーザーの合図でマージ。
