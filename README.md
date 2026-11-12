# Tadori

インフラ作業などの手順書を決まった形で作って版を管理し、実際の作業を「実行」として記録する Web アプリです。社内のサーバーに `docker compose` で立てて使います。

## できること

- **手順書**：ステップ（説明・コマンド・確認方法）と切り戻しのステップを並べた手順書を作り、下書き → 公開で版を重ねる。公開済みの版と下書きの変更点を見比べられる。
- **変数**：手順書に `#{host}` のような変数を書き、実行のときに値を入れる。パスワードなどの秘密変数は DB に保存せず、記録やログでは伏せ字にする。
- **実行の記録**：ステップごとに状態・コメント・エビデンスを残す。中断してもあとから再開できる。
- **承認**：終わった実行を承認者が確かめ、承認・差し戻す。自分の実行は承認できない。
- **Excel 出力**：実行の記録を A4 横で印刷できる Excel に出す。
- **ロール**：管理者・承認者・作業者・閲覧者の4つ。
- **運用**：毎日の自動バックアップと復元のコマンド、任意の HTTPS（Caddy）。

画面と記録は日本語です。

## 動かす

必要なもの：Docker（Compose v2 を含む）。本番は Linux の Docker Engine を勧めます。

```sh
git clone https://github.com/at0hs/tadori.git
cd tadori
cp .env.example .env
```

`.env` の「本番で必ず書き換える」の値を書き換えます。

| 変数 | 書く値 |
|---|---|
| `APP_URL` | 利用者がブラウザで開く URL（例：`http://tadori.example.test:3000`） |
| `BETTER_AUTH_SECRET` | 32文字以上のランダムな文字列（`openssl rand -base64 32`） |
| `POSTGRES_PASSWORD` | 英数字だけのランダムな文字列（`openssl rand -hex 24`） |
| `INITIAL_ADMIN_*` | 最初の管理者のユーザー名・名前・メールアドレス・初期パスワード |

```sh
docker compose up -d --build --wait
```

`APP_URL` を開き、最初の管理者でログインします。最初にパスワードの変更を求められます。あとは管理者の画面で、ユーザーを作ってロールを付けてください。

動いている版は、画面右上の自分のメニューの「Tadori について」で確かめられます。

## 運用

版の上げ方、バックアップと復元、HTTPS 化、管理者のパスワードを忘れたときの復旧などは [docs/operations.md](docs/operations.md) にまとめています。特に次の点に気をつけてください。

- **版を上げる前に、その場でバックアップを取る**（`docker compose exec backup tadori-backup`）。手順は [4章](docs/operations.md#4-版を上げる)。
- バックアップは `./backups` に毎日 3:00（日本時間）に取ります。時刻と残す数は `.env` で変えられます。
- `docker compose down -v` は DB のデータを消すので使わないでください。
- HTTPS にするときは、`.env` で `compose.https.yaml` を足すと前段に Caddy が立ちます（[9章](docs/operations.md#9-https-化する)）。

リリースの一覧は [Releases](https://github.com/at0hs/tadori/releases) にあります。

## 開発

必要なもの：Node.js 26、pnpm（`package.json` の `packageManager` の版）、Docker。

```sh
pnpm install
cp .env.example .env   # 開発ではこのままで動く
pnpm db:up             # 開発用とテスト用の PostgreSQL
pnpm dev               # API :3000、画面 http://localhost:5173
```

| やること | コマンド |
|---|---|
| 型チェック | `pnpm typecheck` |
| lint・フォーマットの確認 | `pnpm lint` |
| テスト | `pnpm test` |
| E2E（Playwright） | `pnpm e2e` |
| 画面のビルド | `pnpm build` |

構成は pnpm のワークスペースで、`server/`（Hono・Drizzle・Better Auth）、`web/`（React・TanStack Router・TanStack Query・shadcn/ui）、`shared/`（画面と API で共有する Zod のスキーマなど）です。

## ライセンス

[MIT](LICENSE)
