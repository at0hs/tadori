# 本番用の構成（compose・Dockerfile・バックアップ）の設計

- 作成日：2026-11-08
- 対応する要件：5章（稼働環境・ログ・バックアップ）、F-10（`docker compose logs` で見られる）
- 関係する設計判断：D-10、D-19、D-20、D-21、D-50〜D-54、D-60
- 運用の流れは `../tadori-docs/design/operations.md`。この文書は、それを動く形にするための決まりを書く。

## 1. ねらい

機能（F-01〜F-10）と画面（S-01〜S-16）はそろった。残っているのは、利用者が `docker compose up` だけで使い始められ、記録を失わずに運用を続けられる構成である。

ユーザーの方針（2026-11-08）：個人開発だが、実運用に耐えるものにする。そのため、バックアップはアプリ側（backup コンテナ）で自動で取る。頻度と世代は利用者が調整できるようにする。

### 目標

- `.env` を書いて `docker compose up -d` を実行すれば、app・db・backup が起動し、`APP_URL` で使える。
- app は API とビルド済みの画面を1つのポートで配信する（D-10）。
- バックアップは既定で1日1回・7世代。時刻と世代は `.env` で変えられる。
- 手で取るバックアップ、復元、復元の確認、管理者の復旧を、それぞれ1行のコマンドでできる。Windows（Docker Desktop）でも、ホストに bash を入れずに動く。
- operations.md に、実際に動かして確かめたコマンドを書く。

### 目標にしないこと

- HTTPS をアプリで扱うこと（D-21。前段のプロキシで扱う）。
- イメージをレジストリに公開すること。利用者がリポジトリから自分でビルドする（operations.md 2章）。
- backup コンテナで毎日復元を確かめること（D-54 で「必要になったら足す」とした）。
- cron の書き方での頻度の指定（「週に1回」「平日だけ」など）。

### 避けること（動いても失敗とみなすもの）

- バックアップが黙って取られていない状態。設定の誤り・失敗はログに出し、設定の誤りではコンテナを止める。
- 書きかけのダンプを1世代と数え、古い正常なダンプを消すこと。
- ダミーの秘密鍵のまま本番で動くこと。

## 2. 検討した案

### 2.1 毎日の実行をだれが持つか

| 案 | 内容 | 結論 |
|---|---|---|
| アプリ側で持つ | backup コンテナが決まった時刻に取る（D-19） | **採用**。設定を忘れても取られる。消えて困るのは客先に出す証跡（実行記録・承認） |
| 利用者に任せる | コマンドだけ用意し、定期実行はホストの cron などで | 採らない。設定を忘れても気づけない。ホストごとに設定が要る |

### 2.2 backup コンテナで時刻を待つ方法

| 案 | 内容 | 結論 |
|---|---|---|
| A | `postgres:18` にシェルのスクリプトを足す。`BACKUP_TIMES` のうち次の時刻まで待って取ることを繰り返す | **採用**。部品が増えない。「1日2回」程度までの調整はこれで足りる |
| B | supercronic を入れ、cron の書き方で指定する | 採らない。外から取るバイナリと、その版の管理が増える。1日1回より少なくしたい場面は少ない |

## 3. 決めたこと

### 3.1 環境変数（`.env`）

operations.md 2.1 の仮称を正式な名前にし、次を足す。

| 変数 | 内容 | 既定値 |
|---|---|---|
| `APP_PORT` | ホストで app を公開するポート | `3000` |
| `POSTGRES_PASSWORD` | DB のパスワード。URL に埋めるので、英数字だけにする（例：`openssl rand -hex 24`） | なし（必須） |
| `BACKUP_TIMES` | バックアップを取る時刻（日本時間、`HH:MM`）。カンマ区切りで複数書ける | `03:00` |
| `BACKUP_KEEP` | 自動で取ったダンプを残す数（日数ではなくファイルの数）。1以上 | `7` |

- `APP_URL`・`BETTER_AUTH_SECRET`・`TRUSTED_PROXIES`・`INITIAL_ADMIN_*` は今のまま。
- `DATABASE_URL` と `PORT` は compose が app に渡す（`.env` の値は本番では使わない）。
- 必須の値が空なら、`docker compose up` が始まる前に止まる（compose の `${VAR:?メッセージ}`）。

### 3.2 構成（compose.yaml）

| サービス | イメージ | 内容 |
|---|---|---|
| app | このリポジトリの `Dockerfile` | `APP_PORT:3000` を公開。db の healthcheck が通ってから起動。healthcheck は `/api/health` |
| db | `postgres:18` | ポートは公開しない。データは名前付きボリューム `db-data` |
| backup | `backup/Dockerfile`（`postgres:18` ＋スクリプト） | `./backups` をマウント。`TZ=Asia/Tokyo` |

- 3つとも `restart: unless-stopped`。ログは json-file で `max-size`・`max-file` を決める（operations.md 10章）。
- `docker compose up` の既定のファイル名が `compose.yaml` なので、本番用はこの名前にする（開発用は `compose.dev.yaml` のまま）。

### 3.3 app のイメージ

- 2段のビルド。1段目でワークスペース全体の依存を入れて画面をビルドする（`pnpm build`）。2段目は本番の依存だけを入れ、`server/`・`shared/`・`web/dist/` を置く。
- **ワークスペースの並びを保つ**。Node は `node_modules` の中の `.ts` の型を消さないため、`shared` を `node_modules` に写す `pnpm deploy` は使わない。2段目でも `pnpm install --prod --frozen-lockfile` で、シンボリックリンクのまま入れる。
- `node` ユーザーで動かす。起動は `node server/src/index.ts`。

### 3.4 画面の配信（server）

- 画面のビルドの置き場を環境変数（`WEB_DIST_DIR`）で受け取る。指定したときだけ配信する。開発（Vite が配信）では指定しない。
- `/api` 以外の GET では、ファイルがあればそれを返し、なければ `index.html` を返す（画面のルーターが URL を解釈し、合わなければ S-16 を出す）。
- `/api` の下で合わない URL は、今までどおり API の 404 にする。
- キャッシュ：`assets/` の下（名前にハッシュが付く）は長く持たせ、`index.html` は毎回確かめさせる（`no-cache`）。版を上げた直後に古い画面が残らないようにする。

### 3.5 ダミーの秘密鍵を断る

- app は起動時に、`BETTER_AUTH_SECRET` が `.env.example` のダミーの値と同じなら、エラーを出して止まる。`.env.example` を写しただけで本番に出すことを防ぐ。
- 開発の `.env` はこのダミーの値を使っているので、断るのは `NODE_ENV=production`（app のイメージで設定する）のときだけにする。

### 3.6 バックアップ（backup コンテナ）

コマンドはすべて backup のイメージに入れる。ホストには Docker だけあればよい。

| やること | コマンド |
|---|---|
| 毎日のバックアップ | コンテナの既定の動き。`BACKUP_TIMES` の時刻ごとに取り、`BACKUP_KEEP` を超えた古いものを消す |
| その場で取る（operations.md 5.2） | `docker compose exec backup tadori-backup` |
| 復元の確認（D-54） | `docker compose run --rm backup tadori-verify [ダンプ]` |
| 復元（operations.md 6.1） | `docker compose stop app` → `docker compose exec backup tadori-restore <ダンプ>` → `docker compose start app` |

- 置き場：自動は `backups/auto/`、手で取ったものは `backups/manual/`。世代の数え方と自動の削除は `auto/` だけが対象。
- 形式は `pg_dump -Fc`。ファイル名は日本時間の日時（例：`tadori-20261108-030000.dump`）。
- **書きかけを数えない**：一時的な名前に書き、`pg_dump` が成功してから本来の名前に変える。失敗したら一時ファイルを消し、ログに出す。成功した後にだけ古いものを消す。
- 起動時に `BACKUP_TIMES`・`BACKUP_KEEP` を検証し、誤りならログに出して止まる（`restart` で繰り返し止まるので、`docker compose ps`・`logs` で気づける）。起動時に次の実行時刻をログに出す。
- ダンプは DB の中身がすべて入るため、ファイルは所有者だけが読める権限で作る（operations.md 11章）。
- 復元の確認（`tadori-verify`）は、`run --rm` で作った使い捨てのコンテナの中に一時的な PostgreSQL を立て、ダンプを戻し、主なテーブル（ユーザー・手順書・版・実行）の件数を出す。動いている db には触らない。ダンプを省いたら、`auto/` と `manual/` のうち一番新しいものを使う。
- 復元（`tadori-restore`）は、DB を作り直してからダンプを戻す。app が止まっていなければ（db への接続が残っていれば）断る。消す操作なので、確認の入力を求める（`--yes` で省ける）。
- スクリプトは改行が LF でないとコンテナで動かない。`.gitattributes` で `*.sh` を LF に固定する。

### 3.7 管理者の復旧

- `docker compose exec app node server/src/cli/recover-admin.ts <ユーザー名>`（app のイメージに環境変数があるので `--env-file` は不要）。operations.md 8章に書く。

### 3.8 CI

- 今の check のジョブとは別に、本番の構成を確かめるジョブを足す。ダミーの `.env` を作り、`docker compose up -d --build --wait` → `/api/health` と画面の `/` が返る → `tadori-backup` → `tadori-verify` が件数を出す。
- バックアップの時刻の計算（次の実行時刻、日付の繰り上がり、複数の時刻）は、スクリプトを関数に分けて、CI のジョブの中でテストする。

### 3.9 文書

- 要件5章のバックアップ：「既定では1日1回 `pg_dump` を取得し、DB とは別の場所に7世代保管する。頻度と世代は設定で変えられる」。
- D-19 に、時刻と世代を `.env` で変えられること・案 A を採ったことを書き足す。
- operations.md：2.1（変数の正式な名前）、3章（初めての起動）、5〜6章（コマンド）、8章（復旧のコマンド）を、動かして確かめた内容で書き直す。
- `.env.example`：本番で書き換える値（`APP_URL`・秘密の値・`POSTGRES_PASSWORD`）と、開発だけで使う値（`DATABASE_URL`・`PORT`）が分かるように説明を書く。
- tadori/CLAUDE.md の「現状」「構成」「コマンド」を更新する。

## 4. 実装する人に任せること

- ログの `max-size`・`max-file` の値、healthcheck の間隔。
- `node:26` のどの種類のイメージを使うか（slim など）。動くことと大きさで決める。
- スクリプトの分け方とファイル名（`backup/` の下）。
- 静的配信に Hono の `serveStatic` を使うか、自前で書くか。
- app の healthcheck の書き方（slim のイメージには curl がないので、`node -e` で `fetch` するなど）。
- `tadori-verify` の一時的な PostgreSQL は root では起動できない（`initdb` が断る）。所有者だけが読めるダンプをどう渡すか（root で読んで標準入力から `pg_restore` に渡すなど）。
- Linux のホストでは、`./backups` の中のファイルは root の持ち物になる（読むには sudo が要る）。operations.md 11章の「サーバーの管理者だけが読める」に合うので、これでよいとする。
