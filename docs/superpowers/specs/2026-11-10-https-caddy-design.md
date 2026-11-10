# HTTPS 用の Caddy を compose に足す（設計）

- 日付：2026-11-10
- 関係する決定：D-21（アプリは HTTP、前段のプロキシで HTTPS）、D-52・D-60（プロキシの後ろでの IP）、D-67（閉じたネットワークでも HTTPS を推奨。必須にはしない）

## レビュー後の変更（2026-11-10、ユーザーが決めた）

レビューの I-3 を受け、profile `https` をやめ、HTTPS の部分を別ファイル `compose.https.yaml` に分けた。以下の本文の「profile」「`--profile https`」は、この形に読み替える。

- 理由：profile では、HTTPS を使わない環境にも範囲を固定したネットワーク `proxy` ができる。同じホストで2つ目の環境を起動すると範囲がぶつかって失敗し（受入環境を動かしたまま手元で試す場合など）、社内 LAN と範囲が重なるとその端末から届かなくなる。
- 足し方：`.env` に `COMPOSE_PATH_SEPARATOR=:` と `COMPOSE_FILE=compose.yaml:compose.https.yaml` を書く（Windows でも同じ書き方で動くことを確かめた）。
- `compose.https.yaml` は HTTPS のときしか読まないので、次のようにできた。
  - `CADDY_TLS`・`APP_URL` に `:?`（必須）を使い、空なら起動の前に止める。
  - app の `TRUSTED_PROXIES` に `CADDY_IP` を自動で入れる（`.env` の `TRUSTED_PROXIES` は使わない。合わせ忘れがなくなる）。
  - app のポートを `!override` で `127.0.0.1` だけにする（`.env` の `APP_PORT` に `127.0.0.1:` を書かなくてよい）。
- HTTP の環境の compose.yaml は、main と比べてコメント1行しか変わらない。

## 目的

ユーザーは「実運用を想定した作り」を望んでいる。D-67 で HTTPS を推奨にしたが、今は operations.md 9章に「Caddy などを置く」とあるだけで、組み方は利用者に任せている。`TRUSTED_PROXIES` の値や証明書の残し方を間違えると、全員がログインの回数制限で締め出される、端末に証明書を入れ直す、といった事故になる。compose に組み込み、手順どおりに進めれば HTTPS で動く形にする。

## ゴール・非ゴール

- ゴール
  - `docker compose --profile https up -d` で、Caddy が前段に立って HTTPS で動く。
  - 証明書の用意の仕方を `.env` の `CADDY_TLS` で3通りから選べる。
    - `internal`：Caddy が自分の認証局で出す（社内の認証局がない閉じたネットワーク）。
    - 証明書と秘密鍵のファイル：社内の認証局で発行してもらった証明書や、買った証明書を置く。社内の認証局のルート証明書がすでに端末に配られている会社では、新しいルート証明書を配らずに済む。
    - メールアドレス：Let's Encrypt から取る（インターネットに公開する場合）。
  - `internal` では、ルート証明書を取り出して端末に信頼させる手順を、持ち込みでは差し替えの手順を operations.md 9章に書く。
- 非ゴール
  - HTTPS を必須にすること（D-67 のとおり。`docker compose up` だけで今までどおり HTTP で動く）。
  - アプリのコードを変えること（すでにプロキシの後ろで動く作りになっている）。
  - HSTS（社内の認証局で使うと HTTP に戻しにくくなる）、80/443 以外のポート、持ち込んだ証明書の自動の更新。
- 失敗とみなすこと：HTTPS にしたせいで、全員が同じ IP に見えて回数制限に引っかかる、または利用者が IP を偽れる。

## 案（決定：A）

- **A. profile `https` で Caddy を任意に起動する（採用）**：普段の起動は変わらず、D-67 と合う。
- B. Caddy を常に起動する：ローカルで試すだけでも証明書の警告が出る。D-67 の「必須にしない」と食い違う。
- C. compose は変えず、手順書に例を書くだけ：ネットワークの範囲の固定や証明書の保存を利用者が自分で組むことになり、事故を防げない。

## 設計

### compose.yaml

- サービス `caddy` を足す。`profiles: [https]`。
  - イメージは `caddy:2.11`（マイナー版で固定し、パッチの更新は取り込む。postgres:18 と同じ考え方）。
  - ポート：`80:80`、`443:443`、`443:443/udp`（HTTP/3）。
  - ボリューム：`./Caddyfile:/etc/caddy/Caddyfile:ro`、`./certs:/certs:ro`（持ち込みの証明書の置き場。`certs/` は `.gitignore` に足す）、名前付きボリュームの `caddy-data:/data`（証明書と `tls internal` のルート証明書。消すと端末に入れ直すことになる）、`caddy-config:/config`。
  - 環境変数：`APP_URL`（サイトのアドレスとして使う）、`CADDY_TLS`（`internal`、`/certs/<証明書> /certs/<秘密鍵>`、メールアドレスのどれか）。
    - compose の `:?`（必須）は使えない。compose は profile で外したサービスの変数も展開するので、`:?` にすると HTTPS を使わない `docker compose up` まで止まる（Compose v5.6.1 で確かめた）。空のときは Caddy が Caddyfile の読み込みで止まり、`docker compose logs caddy` に出る。
  - `restart: unless-stopped`、ログの設定は他と同じ。
- ネットワーク：Caddy と app だけがつながるネットワーク `proxy` を足し、アドレスの範囲を固定して（`PROXY_SUBNET`、既定 `10.203.53.0/24`）、Caddy に決まった IP を割り当てる（`CADDY_IP`、既定 `10.203.53.2`）。app などに自動で割り当てる範囲は `PROXY_IP_RANGE`（既定 `10.203.53.128/25`）に限る（重なると app が先に Caddy の IP を取り、Caddy が起動できない。実装で確かめた）。社内 LAN や同じホストの別の環境とぶつかるときは3つをそろえて変える。app は既定のネットワークと `proxy` の両方につなぐ（profile なしでも `proxy` はできる）。
  - `TRUSTED_PROXIES` には `CADDY_IP` と同じ値を1つだけ書く。範囲全体は信頼しない：サーバー自身から開いたときや Docker Desktop では、利用者が `proxy` のゲートウェイ（`10.203.53.1`）から来たように見え、範囲全体を信頼するとその利用者が付けたヘッダを信じてしまう。
  - 既定の範囲を Docker が自動で割り当てる範囲（172.17〜172.31、192.168）の外にしたのは、ほかのネットワークとぶつかりにくくするため。
  - `TRUSTED_PROXIES` は自動では入れない。プロキシなしで動かすときは空のままにする（今と同じ）。
- app のポート：HTTPS のときは `.env` で `APP_PORT=127.0.0.1:3000` にし、サーバーの外から直接 app に届かないようにする（今の `"${APP_PORT:-3000}:3000"` のままで、compose の書き換えは要らない）。

### Caddyfile（リポジトリの直下に置く）

```
{$APP_URL} {
	tls {$CADDY_TLS}
	reverse_proxy app:3000
}
```

- サイトのアドレスに `APP_URL` をそのまま使う。Better Auth の基準 URL・CSRF・Cookie の Secure と、Caddy が待ち受けるホスト名がずれない。IP アドレスの URL（例：`https://192.168.1.10`）でも `tls internal` なら証明書が出る。
- `CADDY_TLS` は Caddyfile を読む前に展開されるので、値の空白で引数が分かれる。
  - `tls internal`：Caddy が自分の認証局で証明書を出す。
  - `tls /certs/tadori.crt /certs/tadori.key`：置いたファイルを使う。証明書のファイルには中間証明書もつなげて入れる。自動では更新しないので、期限の前に差し替えて `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --force` で読み込み直す（`--force` がないと、設定が同じなので読み込み直さない。レビューの I-1、実際に差し替えて確かめた）。
- `APP_URL` が `https://<名前>` の形でない（末尾の `/`・パス・ポート・http）と、Caddy は `/` だけを転送したり 443 で待ち受けなかったりしたまま起動する。caddy の entrypoint で形を確かめ、違えば起動を断る（レビューの I-2）。
  - `tls <メールアドレス>`：Let's Encrypt から取る（DNS とポート 80/443 が外から届くことが前提）。
- 転送のヘッダ：Caddy は、信頼するプロキシを設定していなければ、利用者が付けてきた `X-Forwarded-For` を捨てて付け直す。operations.md 9章の「プロキシは自分で付け直す」を満たす。
- HTTP（80）に来たら HTTPS に移す。Caddy の既定の動きに任せる。

### .env.example

`CADDY_TLS`、`PROXY_SUBNET`、`CADDY_IP` を足し、HTTPS で動かすときに書く値（`APP_URL=https://…`、`APP_PORT=127.0.0.1:3000`、`TRUSTED_PROXIES=<CADDY_IP と同じ値>`）を説明に書く。

### 文書（tadori-docs）

- operations.md 9章を手順に書き直す：`.env` の書き方、起動、3通りの証明書の選び方、`internal` のルート証明書の取り出し（`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .`）と Windows・macOS・Linux・Firefox での信頼のさせ方、持ち込みの証明書の置き方（中間証明書をつなげる、秘密鍵の権限）と期限前の差し替え、`caddy-data` を消さないこと、HTTP から HTTPS への移し方。
- decisions.md に決定を足す（D-67 の「受入テストの後に決める」に答える）。

### 確かめ方

- CI の compose のジョブに、`--profile https`・`CADDY_TLS=internal`・`APP_URL=https://localhost` で起動し、取り出したルート証明書で `curl --cacert root.crt https://localhost/api/health` が通ることを足す。
- 持ち込みの形は、openssl で作った自前の認証局と証明書を `certs/` に置き、その認証局で `curl --cacert` が通ることを CI で確かめる。
- 受入環境（tadori-acceptance）で、ルート証明書を Windows に信頼させ、Chrome で警告なしに開けてログインできること、操作ログの IP が Caddy ではなく端末の IP になっていること、を確かめる。既存の環境にネットワークを足す上げ方（operations.md 4章）も、ここで一緒に確かめる。

- CI で、偽の `X-Forwarded-For` を付けて Caddy 経由でログインに失敗させ、操作ログの IP が偽の値でも Caddy の IP でもないことを確かめる。

## 実装で確かめること

- app は IPv4 と IPv6 の両方で待ち受けているので、Caddy から来た接続のアドレスが `::ffff:10.203.53.2` の形で見えることがある。Better Auth 1.7.17 の照合はこの形を IPv4 に直してから比べる（`@better-auth/core` の `ipToBytes`）。Better Auth を上げたときに崩れないよう、単体テストで押さえる。
- 既存の compose のプロジェクトにネットワーク `proxy` を足したとき、`up` で app がつなぎ直されるか。

## 実装する人に任せること

- Caddy の healthcheck の有無、CI のステップの細かい書き方。
