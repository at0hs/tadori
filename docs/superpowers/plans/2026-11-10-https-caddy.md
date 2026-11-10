# HTTPS 用の Caddy を compose に足す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose --profile https up -d` で、Caddy が前段に立ち HTTPS で動くようにする（証明書は internal／持ち込み／Let's Encrypt の3通り）。

**Architecture:** compose.yaml に profile `https` の `caddy` サービスと、Caddy と app だけがつながる固定の範囲のネットワーク `proxy` を足す。Caddy は決まった IP を持ち、app の `TRUSTED_PROXIES` にはその IP だけを書く。Caddyfile は `APP_URL` をサイトのアドレスに、`CADDY_TLS` を `tls` の引数にそのまま使う。アプリのコードは変えない。

**Tech Stack:** Docker Compose（v5.6.1 で確認）、Caddy 2.11（`caddy:2.11`）、GitHub Actions、openssl。

**Spec:** `docs/superpowers/specs/2026-11-10-https-caddy-design.md`

## Global Constraints

- イメージは `caddy:2.11`（マイナー版で固定）。
- ポートは `80:80`、`443:443`、`443:443/udp` に固定。
- `PROXY_SUBNET` の既定 `10.203.53.0/24`、`CADDY_IP` の既定 `10.203.53.2`。`TRUSTED_PROXIES` には `CADDY_IP` と同じ値を1つだけ書く（範囲は書かない）。
- caddy の変数に compose の `:?` を使わない（profile なしの `docker compose up` まで止まる）。`${VAR:-既定}` か `${VAR:-}` にする。
- `CADDY_TLS` の値は `internal`／`/certs/<証明書> /certs/<秘密鍵>`／メールアドレス。
- `caddy-data` は名前付きボリューム（`internal` のルート証明書が入る）。`certs/` は `.gitignore` に入れる。
- HSTS は付けない。アプリのコードは変えない。
- 普段の `docker compose up`（profile なし）の動きは今と同じ（CI の既存の compose のジョブがそのまま通る）。
- コメント・文書は日本語、tadori-docs の書き方は tadori-docs/CLAUDE.md に従う。tadori-docs はコミットまで。push はユーザーに確かめてから。

## Review Focus

1. 利用者が偽の `X-Forwarded-For` を付けて Caddy 経由で来る → 操作ログの IP は偽の値にならない（Task 3 の CI で押さえる）。
2. サーバー自身から・Docker Desktop で開くと、利用者は `proxy` のゲートウェイ（`10.203.53.1`）から来たように見える → それでも偽のヘッダを信じない、IP は Caddy の IP にもならない（Task 3 の CI、Task 1 の単体テスト）。
3. HTTPS を使わない既存の環境が版を上げる → ネットワーク `proxy` ができ app がつなぎ直されるだけで、今までどおり動く（Task 2 の確かめ、既存の CI のジョブ、Task 5）。
4. `CADDY_TLS` を書き忘れて `--profile https` で起動 → `up --wait` が失敗し、`docker compose logs caddy` で理由が分かる（Task 2 の確かめ）。
5. `CADDY_IP` を変えて `TRUSTED_PROXIES` を合わせ忘れる → 全員が Caddy の IP に見える。コードでは防げないので operations.md 9章の手順と注意で押さえる（Task 4）。

---

### Task 1: IPv4 に写した IPv6 の形の Caddy の IP を信頼できることを押さえる

app は `::` で待ち受けるので、Caddy からの接続は `::ffff:10.203.53.2` に見えることがある。Better Auth 1.7.17 はこの形を IPv4 に直して照合する。Better Auth を上げたときに崩れないよう、テストで押さえる（実装は変えない）。

**Files:**
- Test: `server/src/auth/client-ip.test.ts`

**Interfaces:**
- Consumes: `rewriteForwardedFor(received, socket, trustProxies)`（`server/src/auth/client-ip.ts`）、`getIP(headers, options)`（`better-auth/api`）
- Produces: なし

- [ ] **Step 1: テストを足す**

`describe("Caddy の後ろ（D-67）")` に次の2つ。`getIP` に渡す options は `{ advanced: { ipAddress: { trustedProxies: ["10.203.53.2"] } } }`（auth.ts と同じ形）。ヘッダは `rewriteForwardedFor` で作った値を `new Headers({ "x-forwarded-for": … })` に入れる。

```ts
it("接続相手が ::ffff: の形の Caddy の IP でも、Caddy が付けた利用者の IP を読む", () => {
  const xff = rewriteForwardedFor("192.0.2.50", "::ffff:10.203.53.2", true);
  expect(getIP(new Headers({ "x-forwarded-for": xff! }), options)).toBe("192.0.2.50");
});

it("ゲートウェイ（10.203.53.1）は信頼しない。利用者が付けた偽の値を読まない", () => {
  // Caddy は利用者の偽の値を捨て、ゲートウェイのアドレスだけを付ける
  const xff = rewriteForwardedFor("10.203.53.1", "::ffff:10.203.53.2", true);
  expect(getIP(new Headers({ "x-forwarded-for": xff! }), options)).toBe("10.203.53.1");
});
```

- [ ] **Step 2: 通ることを確かめる**

Run: `pnpm --filter @tadori/server exec vitest run src/auth/client-ip.test.ts`
Expected: PASS（今の Better Auth で通る。押さえのテスト）。もし `getIP` が開発環境の扱いで `127.0.0.1` などを返すなら、`NODE_ENV` の扱いを確かめて options か環境を合わせる。

- [ ] **Step 3: コミット**

```bash
git add server/src/auth/client-ip.test.ts
git commit -m "Caddy の後ろで ::ffff: の形の IP を信頼できることをテストで押さえる"
```

### Task 2: compose に caddy と proxy のネットワークを足す

**Files:**
- Create: `Caddyfile`
- Modify: `compose.yaml`、`.env.example`、`.gitignore`

**Interfaces:**
- Produces: サービス名 `caddy`、ネットワーク名 `proxy`、ボリューム `caddy-data`・`caddy-config`、変数 `CADDY_TLS`・`PROXY_SUBNET`・`CADDY_IP`（Task 3・4 が使う）

- [ ] **Step 1: Caddyfile を書く**

```
# HTTPS の前段（operations.md 9章、D-67）。`docker compose --profile https up -d` で起動する。
# サイトのアドレスは APP_URL、tls の引数は CADDY_TLS（internal／証明書と秘密鍵のファイル／メールアドレス）。
{$APP_URL} {
	tls {$CADDY_TLS}
	reverse_proxy app:3000
}
```

- [ ] **Step 2: compose.yaml を直す**

- `caddy` サービス：`image: caddy:2.11`、`profiles: [https]`、`restart: unless-stopped`、`depends_on: app: condition: service_healthy`、ポート3つ、環境変数 `APP_URL: ${APP_URL:-}`・`CADDY_TLS: ${CADDY_TLS:-}`、ボリューム `./Caddyfile:/etc/caddy/Caddyfile:ro`・`./certs:/certs:ro`・`caddy-data:/data`・`caddy-config:/config`、`networks: proxy: ipv4_address: ${CADDY_IP:-10.203.53.2}`、`logging: *logging`。
- app に `networks: [default, proxy]` を足す（db・backup は default のまま）。
- トップレベル：`networks: proxy: ipam: config: - subnet: ${PROXY_SUBNET:-10.203.53.0/24}`、`volumes` に `caddy-data:`・`caddy-config:`。
- 先頭のコメントに「HTTPS は `--profile https`（operations.md 9章）」を1行足す。`caddy-data` を消すと端末に証明書を入れ直すことになる旨をボリュームの横に書く。

- [ ] **Step 3: .env.example と .gitignore を直す**

- `.gitignore` に `certs/`。
- `.env.example` の「必要なら変える」に、HTTPS の段落を足す：`CADDY_TLS=`（3通りの書き方の例をコメントに）、`PROXY_SUBNET=10.203.53.0/24`、`CADDY_IP=10.203.53.2`。`TRUSTED_PROXIES` と `APP_PORT` のコメントに、HTTPS のときの値（`TRUSTED_PROXIES=10.203.53.2`＝`CADDY_IP` と同じ、`APP_PORT=127.0.0.1:3000`）、`APP_URL` のコメントに `https://<名前>` を足す。

- [ ] **Step 4: profile なしで今までどおりか確かめる**

Run: `docker compose config --quiet && docker compose config --services`（`.env` は開発用のまま）
Expected: エラーなし、`caddy` は出ない（app・db・backup）。

- [ ] **Step 5: internal で起動して確かめる（使い捨てのプロジェクト名）**

スクラッチの `.env`（`APP_URL=https://localhost`、`CADDY_TLS=internal`、`TRUSTED_PROXIES=10.203.53.2`、`APP_PORT=127.0.0.1:3000`、ほかは CI と同じダミー）で：

Run: `docker compose -p tadori-https-check --env-file <スクラッチ>/.env --profile https up -d --build --wait`、続けて `docker compose -p tadori-https-check cp caddy:/data/caddy/pki/authorities/local/root.crt <スクラッチ>/root.crt` と `curl --cacert <スクラッチ>/root.crt -fsS https://localhost/api/health`
Expected: health が返る。`curl -sI http://localhost/` が HTTPS への 308 を返す。

- [ ] **Step 6: CADDY_TLS を空にすると起動に失敗し、理由がログに出ることを確かめる**

Run: `CADDY_TLS=` にして `docker compose -p tadori-https-check ... --profile https up -d --wait`
Expected: 失敗する（または caddy が再起動を繰り返す）。`docker compose -p tadori-https-check logs caddy` に tls の引数のエラーが出る。確かめたら `docker compose -p tadori-https-check down -v` で片付ける（使い捨てのプロジェクトだけ）。

- [ ] **Step 7: コミット**

```bash
git add Caddyfile compose.yaml .env.example .gitignore
git commit -m "HTTPS の前段の Caddy を profile https で compose に足す（D-67）"
```

### Task 3: CI で HTTPS の3つの確かめを流す

既存の `compose` のジョブは変えない。新しいジョブ `compose-https` を足す。

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 2 のサービス・変数

- [ ] **Step 1: ジョブ `compose-https` を書く**

順に：
1. ダミーの `.env`：既存のジョブの値に `APP_URL=https://localhost`、`CADDY_TLS=internal`、`TRUSTED_PROXIES=10.203.53.2`、`APP_PORT=127.0.0.1:3000` を足す。
2. `docker compose --profile https up -d --build --wait`。
3. internal：`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt root.crt` → `curl --cacert root.crt -fsS https://localhost/api/health`。
4. 偽の X-Forwarded-For：`curl --cacert root.crt -s -o /dev/null -X POST https://localhost/api/auth/sign-in/username -H 'Origin: https://localhost' -H 'Content-Type: application/json' -H 'X-Forwarded-For: 203.0.113.99' -d '{"username":"admin","password":"wrong-password"}'` → `docker compose logs app` の `auth.login_failed` の行に `"ip":"` があり、`203.0.113.99` も `10.203.53.2` も含まないこと（`grep` で確かめる。ログの形は `server/src/lib/operation-log.ts` に合わせる）。
5. 持ち込み：openssl で自前の認証局（`ca.key`/`ca.crt`）と、`subjectAltName=DNS:localhost` のサーバー証明書を作り、`certs/tadori.crt`（サーバー証明書＋認証局の証明書をつなげる）・`certs/tadori.key` に置く → `.env` の `CADDY_TLS=/certs/tadori.crt /certs/tadori.key` に書き換え → `docker compose --profile https up -d --wait`（caddy だけ作り直される）→ `curl --cacert ca.crt -fsS https://localhost/api/health`。
6. `if: failure()` で `docker compose logs`。

- [ ] **Step 2: 手元で流れを確かめる**

Step 1 のシェルの部分を、Task 2 と同じ使い捨てのプロジェクト名で手元の Git Bash で流し、3つとも通ることを確かめる（コンテナのパスは `MSYS_NO_PATHCONV=1`）。終わったら `docker compose -p tadori-https-check down -v`。

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "CI で HTTPS（internal・持ち込み・偽の X-Forwarded-For）を確かめる"
```

### Task 4: 文書を書く（tadori-docs）

**Files:**
- Modify: `tadori-docs/design/operations.md`（2章の表、2.1、9章）、`tadori-docs/design/decisions.md`（D-68 を足す、D-67 の「受入テストの後に決める」に D-68 への参照）

- [ ] **Step 1: operations.md**

- 2章のコンテナの表に caddy（`caddy:2.11`、profile `https` のときだけ）、データの置き場の表に `caddy-data`（名前付きボリューム。internal のルート証明書と取った証明書）と `./certs`（持ち込みの証明書）。
- 2.1 の表に `CADDY_TLS`・`PROXY_SUBNET`・`CADDY_IP`。`APP_PORT`・`TRUSTED_PROXIES` の行に HTTPS のときの値。
- 9章を手順に書き直す：
  - 9.1 共通の `.env`（`APP_URL=https://…`、`APP_PORT=127.0.0.1:3000`、`TRUSTED_PROXIES` は `CADDY_IP` と同じ値1つ、範囲を書かない理由）と起動（`docker compose --profile https up -d --wait`）。以後のコマンドもすべて `--profile https` を付けること（付けないと caddy が止まらない・作り直されない）。
  - 9.2 internal：ルート証明書の取り出し、Windows（`certutil -addstore -f Root root.crt`、管理者の権限）・macOS（キーチェーン）・Linux（`/usr/local/share/ca-certificates` ＋ `update-ca-certificates`）・Firefox（自分の証明書の置き場。`security.enterprise_roots.enabled`）での信頼のさせ方。`caddy-data` を消すとルート証明書が変わり、全端末で入れ直しになること。
  - 9.3 持ち込み：`certs/` に置く、中間証明書をつなげる、秘密鍵の権限（サーバーの管理者だけ）、期限の前に差し替えて `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`。
  - 9.4 Let's Encrypt：DNS とポート 80/443 が外から届くこと、`CADDY_TLS` はメールアドレス。
  - 9.5 HTTP から移すとき：`APP_URL` が変わるとセッションの Cookie が変わり全員がログインし直すこと、`PROXY_SUBNET`・`CADDY_IP` がぶつかるときの変え方（同じホストに2つ目の環境を置くときも）。
  - 今の 9章の `TRUSTED_PROXIES` の注意（書かないと全員が締め出される、プロキシを通らない経路で IP を偽られる）は残す。
- [ ] **Step 2: decisions.md に D-68**

「HTTPS の前段の Caddy を profile `https` で compose に含める」。決定（profile で任意、証明書の3通り、Caddy に決まった IP を割り当てそれだけを信頼する）、理由（実運用を想定した作り、TRUSTED_PROXIES や証明書の扱いの事故を防ぐ、D-67 の「必須にしない」と合う）、受け入れる制約（持ち込みの証明書は自動で更新しない、`proxy` のネットワークは HTTPS を使わなくてもできる、HSTS なし）、検討した案（常に起動する、手順書に書くだけ、範囲全体を信頼する）。設計の spec の「案」と「ネットワーク」の理由を写す。

- [ ] **Step 3: tadori-docs でコミット（push はユーザーに確かめてから）**

```bash
git -C ../tadori-docs add design/operations.md design/decisions.md
git -C ../tadori-docs commit -m "HTTPS の前段の Caddy を compose に含める（D-68、operations.md 9章）"
```

### Task 5: 受入環境で確かめ、レビューして PR にする

- [ ] **Step 1: Opus のエージェントでブランチ全体をレビューし、Critical・Important を直す**
- [ ] **Step 2: 受入環境（`S:\03_Development\tadori-acceptance`）で確かめる（ユーザーと一緒に）**
  - operations.md 4章の手順（tadori-backup → ブランチを取り込む → `up -d --build --wait`）で、profile なしのまま上げ、今までどおり :3000 で開けること（Review Focus 3）。
  - `.env` を 9.1・9.2 のとおりに書き換え `--profile https` で起動。ルート証明書を Windows に信頼させるのはユーザーが行う（端末の設定を変えるため）。Chrome で `APP_URL` を警告なしに開けてログインできること、`docker compose logs app` の `auth.login_succeeded` の `ip` が `10.203.53.2` でないこと（Docker Desktop では端末の IP ではなくゲートウェイなどに見えることがある）。
  - 見つかった手順の不足は operations.md に足す。
- [ ] **Step 3: push → PR → CI（`compose` と `compose-https` が通る）→ ユーザーの合図でマージ。tadori-docs の push もユーザーに確かめる**
