# 運用の手順

Tadori を `docker compose` で動かす人のための手順。

---

## 1. この文書について

- 起動・版上げ・バックアップと復元・PostgreSQL の更新・管理者の復旧・HTTPS 化・リリースの流れを書く。
- コマンドは、このリポジトリの compose・`Dockerfile`・`backup/` で実際に動かして確かめている。食い違ったときは、それらの中身が正しい。
- 例のホスト名・メールアドレス・ファイル名などはダミー。

## 2. 構成

| コンテナ | イメージ | 役割 |
|---|---|---|
| app | アプリ（このリポジトリの `Dockerfile` からビルド） | API と、ビルド済みの画面を配信する。起動時にマイグレーションを流し、ユーザーがいなければ初期管理者を作る |
| db | `postgres:18`（メジャーバージョンを固定） | データベース |
| backup | `postgres:18` にスクリプトを足したもの（`backup/Dockerfile`。db と同じメジャーバージョン） | 決まった時刻に `pg_dump` を取り、決まった数を残す。手で使うバックアップ・復元のコマンドも入っている |
| caddy | `caddy:2.11`（マイナー版を固定） | HTTPS の前段のリバースプロキシ。`compose.https.yaml` を重ねたときだけ起動する（9章） |

| データの置き場 | 種類 | 内容 |
|---|---|---|
| DB のデータ | 名前付きボリューム | PostgreSQL のデータ。Windows の Docker Desktop でホストのディレクトリに置くと遅く、権限の問題も起きやすいため、ボリュームにする |
| バックアップ | ホストのディレクトリ（リポジトリの `./backups`） | ダンプ。DB のボリュームとは別の場所に置く |
| Caddy のデータ | 名前付きボリューム（`caddy-data`） | Caddy が取った証明書と、`internal` のときのルート証明書（9章） |
| 持ち込みの証明書 | ホストのディレクトリ（リポジトリの `./certs`。コミットしない） | 社内の認証局などで発行した証明書と秘密鍵（9.3） |

### 2.1 環境変数（`.env`）

リポジトリには `.env.example`（ダミーの値）だけを置く。compose は `.env` を読み、app・db・backup に必要な値だけを渡す。

| 変数 | 内容 | 既定値 |
|---|---|---|
| `APP_URL` | 利用者がブラウザで開く URL。例：`http://<サーバーの名前>:3000` | なし（必須） |
| `APP_PORT` | ホストで app を公開するポート。HTTPS のときは `127.0.0.1` だけで待ち受ける（9.1） | `3000` |
| `TRUSTED_PROXIES` | 前段のリバースプロキシのアドレス（カンマ区切り）。指定したときだけ、利用者の IP を転送のヘッダから読む。HTTPS のときは使わず、`CADDY_IP` が自動で入る（9.1） | なし |
| `POSTGRES_PASSWORD` | DB のパスワード。接続の URL に埋めるので英数字だけにする（例：`openssl rand -hex 24`） | なし（必須） |
| `BETTER_AUTH_SECRET` | Better Auth の秘密鍵（32文字以上。例：`openssl rand -base64 32`）。`.env.example` の値のままでは app が起動しない | なし（必須） |
| `INITIAL_ADMIN_USERNAME`・`_NAME`・`_EMAIL`・`_PASSWORD` | 初期管理者のユーザー名・名前・メールアドレス・初期パスワード | なし |
| `BACKUP_TIMES` | バックアップを取る時刻（日本時間、`HH:MM`）。カンマ区切りで複数書ける（例：`03:00,15:00`） | `03:00` |
| `BACKUP_KEEP` | 自動のバックアップを残す数。日数ではなくファイルの数（1日2回なら 7 は3.5日分） | `7` |
| `CADDY_TLS` | HTTPS の証明書の用意の仕方。`internal`／`/certs/<証明書> /certs/<秘密鍵>`／メールアドレス（9章） | なし（HTTPS では必須） |
| `COMPOSE_PATH_SEPARATOR`・`COMPOSE_FILE` | `:` と `compose.yaml:compose.https.yaml` にすると、HTTPS の前段の Caddy も起動する（9.1）。Docker Compose が読む変数 | なし |
| `PROXY_SUBNET`・`PROXY_IP_RANGE`・`CADDY_IP` | Caddy と app だけがつながるネットワークの範囲、自動で割り当てる範囲、Caddy の IP（9.5） | `10.203.53.0/24`・`10.203.53.128/25`・`10.203.53.2` |

- `.env.example` の `PORT`・`DATABASE_URL` は開発だけで使う。本番では compose が app に渡す値を決める。
- 必須の値が空なら、`docker compose up` は始まる前にエラーで止まる。
- `POSTGRES_PASSWORD` が効くのは、DB のボリュームを初めて作るときだけである。後から `.env` を書き換えても DB のパスワードは変わらない。変えるときは DB の中で変えてから `.env` を合わせる。
- `BETTER_AUTH_SECRET` を変えると、すべてのセッションが切れる（全員がログインし直す）。
- `INITIAL_ADMIN_*` が使われるのは、ユーザーが1人もいないときだけである。初期管理者を作った後は、書き換えても何も起きない。

## 3. 初めて起動する

1. `.env.example` を `.env` に写し、`APP_URL`・`BETTER_AUTH_SECRET`・`POSTGRES_PASSWORD`・初期管理者を書く。
2. `docker compose up -d --build --wait` で起動する。app と backup は db の準備ができるのを待ってから起動する。`docker compose ps` で3つが動いていること、`docker compose logs backup` に次のバックアップの時刻が出ていることを確かめる。
3. `APP_URL` を開き、初期管理者でログインする。最初にパスワードの変更を求められる。
4. 管理者の画面で、ユーザーを作ってロールを付ける。
5. 「6.2 復元の確認」を一度行い、バックアップから戻せることを確かめる。

## 4. 版を上げる

アプリの新しい版を取り込むときの流れ。マイグレーションは前に進めるだけで、戻すためのマイグレーションは作らない。戻すときはバックアップから復元する。

1. **その場でバックアップを取る**（「5.2 その場でバックアップを取る」）。前日のバックアップでは、その日の記録が失われるため。
2. 新しい版のソースを取り込み（`git pull` など）、`docker compose up -d --build --wait` でイメージをビルドし直して起動し直す。app が起動時にマイグレーションを流す。
3. `docker compose logs app` に「マイグレーションを適用した」「待ち受けを開始した」が出ていることを確かめる。「待ち受けを開始した」の `version`・`commit` が、取り込んだ版とコミット（`git rev-parse --short=7 HEAD`）になっていることも確かめる。画面の自分のメニューの「Tadori について」でも確かめられる。
4. ログイン・手順書の一覧・実行の画面が開けることを確かめる。

**うまくいかなかったとき**：前の版のソースに戻してイメージをビルドし直し、1 のバックアップから復元する（「6.1 復元する」）。戻せるように、配布する版には git のタグを付けておく。

## 5. バックアップ

### 5.1 毎日のバックアップ

- backup コンテナが `BACKUP_TIMES` の時刻（既定は毎日 3:00）に、`pg_dump -Fc` で DB 全体（Better Auth のテーブルを含む）をダンプし、`backups/auto/` に置く。名前は `tadori-YYYYMMDD-HHMMSS.dump`（日本時間）。
- 成功したら、`backups/auto/` のダンプのうち新しい `BACKUP_KEEP` 個（既定は7）を残し、古いものから消す。
- 書きかけは一時的な名前（`.tadori-….dump.tmp`）で書き、成功してから本来の名前に変える。失敗したときは一時ファイルを消し、古いダンプも消さない。止められて書きかけが残った場合（`docker compose stop` の猶予を過ぎて強制終了されたなど）は、次に起動したときに消す。
- 自動・手動のバックアップと復元は、同時には走らない（`backups/.lock` を取り合い、ほかが動いていれば終わるまで待つ）。
- 起動したときに、直前の時刻のバックアップが `backups/auto/` になければ（その時刻にホストが止まっていた・スリープしていたなど）、すぐ1回取る。待っている間も60秒ごとに時計を見直すので、スリープから戻った後に時刻を過ぎていれば、その時点で取る。
- 失敗したら、間を置いてやり直す（10秒・30秒・60秒・2分・5分・10分の後。合わせて約19分）。Docker の再起動で backup が db より先に起動したとき（自動の起動では compose の `depends_on` が効かない）や、一時的な失敗で、次の時刻までバックアップがない状態を避けるため。待っている間はロックを外すので、手で取るバックアップや復元は待たされない。
- 起動時と各回のあとに、次の実行時刻をログに出す。失敗は「バックアップに失敗した」としてログに出る（`docker compose logs backup`）。やり直しきれなかったときは「やり直しをやめる」と出て、次の時刻に取る。
- `BACKUP_TIMES`・`BACKUP_KEEP` が正しくなければ、理由をログに出して止まる（再起動を繰り返すので `docker compose ps` で `Restarting` と見える）。

### 5.2 その場でバックアップを取る

版を上げる前や、PostgreSQL のメジャーバージョンを上げる前に、同じダンプを手で取る。

```sh
docker compose exec backup tadori-backup
```

`backups/manual/` に置く。世代の数え方からは外し、自動では消さない（不要になったら手で消す）。

## 6. 復元

### 6.1 復元する

```sh
docker compose stop app
docker compose exec backup tadori-restore manual/tadori-20261108-101500.dump
docker compose start app
```

1. app を止める（db と backup は動かしたまま）。app などが DB につないでいる間は、`tadori-restore` は断る。ただし app は空いた接続を閉じるので、待ち受け中の app は見分けられない。止め忘れても害が小さいように、次の手順で入れ替える。
2. `tadori-restore` がダンプを別の DB（`tadori_restore`）に `pg_restore` で戻す。戻し終えたら、今の DB への新しい接続を断ったうえで接続を数え、0 件なら今の DB を消して、戻した DB の名前を `tadori` に変える。接続が残っていれば入れ替えずにやめる（今の DB はそのまま）。ダンプは `backups/` からの相対（`auto/…`・`manual/…`）でも指定できる。消す操作なので `yes` の入力を求める（`--yes` で省ける。入力できない環境では `--yes` が要る）。
3. app を起動する。ダンプが古い版のものでも、起動時のマイグレーションで今の版に追いつく。

- `tadori-restore` は DB を消す前に、指定したダンプが読めるか（`pg_restore -l`）を確かめる。読めなければ DB に触らずにやめる。
- 続けて、今の DB を `backups/manual/` に取ってから戻す。戻した後で問題があれば、そのダンプで元に戻せる（終わったときに、戻すためのコマンドを表示する）。今の DB が壊れていて取れないときは `--no-backup` を付ける。
- `pg_restore` が失敗したときは、戻しかけの DB を消してやめる。今の DB には触っていない。
- 戻している間は、一時的に DB 2つ分のディスクを使う。
4. ログインできること、手順書と実行が見えることを確かめる。

- 復元すると、ダンプを取った後の変更はすべて失われる。セッションもダンプの時点に戻るので、利用者はログインし直すことになる場合がある。
- 秘密変数の値はもともと DB にない。復元しても秘密変数の値は戻らず、実行者は入力し直す（実行を再開するときと同じ）。

### 6.2 復元の確認

バックアップから実際に戻せるかは、スクリプトで確かめる。

```sh
docker compose run --rm backup tadori-verify            # 一番新しいダンプ
docker compose run --rm backup tadori-verify auto/tadori-20261108-030000.dump
```

- `run --rm` で作る使い捨てのコンテナの中に一時的な PostgreSQL を立て、ダンプを戻し、主なテーブル（ユーザー・手順書・版・実行）の件数を出して、コンテナごと消す。動いている db には触らない。ダンプを省くと、`auto/` と `manual/` のうち一番新しいものを使う。
- 戻せなければ「復元に失敗した」と出し、0 以外で終わる。
- 実行するのは、初めて構築したとき、版を上げる前、PostgreSQL のメジャーバージョンを上げる前。
- CI では、起動したばかりの DB で取ったダンプに対して、動くことだけを確かめる（本物のバックアップの確認にはならない）。あわせて `tadori-restore` も流し、接続がある間は断ること、バックアップの後の変更が復元で消えることを確かめる。

## 7. PostgreSQL のメジャーバージョンを上げる

メジャーバージョンが違うと、DB のデータの置き場をそのまま使えない。ダンプして戻す方法で移る。

1. その場でバックアップを取り（5.2）、復元の確認（6.2）をする。
2. app を止め、compose の db と backup のイメージを新しいメジャーバージョンにする。
3. DB のボリュームを新しく作り、ダンプを戻す（6.1）。古いボリュームは、新しい版で問題がないと分かるまで残しておく。
4. app を起動して確かめる。

- 19 は 2026-11 時点で正式版の直前なので、最初は 18 で始め、19 が落ち着いてから（19.1 以降を目安に）この手順で移る。

## 8. 管理者を復旧する

管理者は自分のパスワードを画面から再設定できないため、次の場合に、画面からは直せなくなる。

- 管理者が1人で、その人がパスワードを忘れた
- 管理者が全員無効化された（2人が同時に互いを無効化した場合など。画面が防ぐのは、自分自身を無効化することだけ）

そのときは、app コンテナの中で復旧のコマンドを実行する。引数に復旧するユーザーのユーザー名を渡す。

```sh
docker compose exec app node server/src/cli/recover-admin.ts <ユーザー名>
```

コマンドの本体は `server/src/cli/recover-admin.ts`（開発環境では `pnpm --filter @tadori/server recover-admin <ユーザー名>`）。

- 指定したユーザーのパスワードを仮のパスワードにし、「パスワード変更が必要」にし、セッションを失効させる。
- そのユーザーの無効化を解き、管理者ロールを付ける。管理者を戻すためのコマンドなので、指定がなくても常に行う（すでにその状態なら変わらない）。
- 実行したことを操作ログに出す（`event` は `user.recovered`。無効化を解いたか・管理者ロールを付けたかも出す）。実行した端末とコンテナのログ（`docker compose logs app`）の両方に出る（コンテナの中では app の本体の標準出力にも書く）。仮のパスワードはログに出さない。
- 仮のパスワードはコマンドの引数で渡さない（シェルの履歴やプロセスの一覧に残るため）。コマンドが作って、標準エラー出力に一度だけ出す（標準出力には操作ログが流れるので混ぜない）。

コンテナの中に入れる人（サーバーの管理者）だけが使える。画面や API からは使えない。

**間違えて無効化したとき**：画面と API には有効に戻す操作がない（無効化は、メンバーが抜けたときの操作として扱う）。間違えて無効化したときは、このコマンドでそのユーザーを復旧し（無効化が解け、管理者ロールが付く）、管理者がユーザーの詳細の画面でロールを元に戻す。仮のパスワードは本人に伝える。

## 9. HTTPS 化する

前段にリバースプロキシを置いて HTTPS にする。インターネットに公開するときは必須、閉じたネットワークで使うときも推奨する。Caddy は `compose.https.yaml` に入っていて、`.env` でこのファイルを足したときだけ起動する。足さなければ、今までどおり HTTP で動き、ネットワークなども増えない。

証明書の用意の仕方は、`.env` の `CADDY_TLS` で3通りから選ぶ。

| `CADDY_TLS` | 使う場面 | 手順 |
|---|---|---|
| `internal` | 社内の認証局がない、閉じたネットワーク | 9.2 |
| `/certs/tadori.crt /certs/tadori.key` | 社内の認証局で発行してもらった証明書や、買った証明書がある | 9.3 |
| メールアドレス（例：`admin@example.test`） | インターネットに公開する | 9.4 |

### 9.1 共通の手順

1. `.env` に次を書く。

   | 変数 | 値 | 理由 |
   |---|---|---|
   | `COMPOSE_PATH_SEPARATOR` | `:` | 次の行の区切りを、Windows でも `:` にそろえる |
   | `COMPOSE_FILE` | `compose.yaml:compose.https.yaml` | `docker compose` のコマンドが `compose.https.yaml` も読み、Caddy が起動する。4章などのコマンドもそのまま使える。この章のコマンドは、これを書いた前提で示す |
   | `APP_URL` | `https://<サーバーの名前>`（例：`https://tadori.example.test`。末尾の `/`・パス・ポートは付けない。付けると caddy が起動を断る） | Caddy はこの値をサイトのアドレスにする。Better Auth の基準 URL、CSRF の `Origin` の確認、Cookie の `Secure` 属性も、この値から決まる |
   | `CADDY_TLS` | 上の表のどれか | 空なら起動の前にエラーで止まる |

   次の2つは `compose.https.yaml` が決めるので、書かなくてよい。

   - app は `127.0.0.1` だけで待ち受ける。サーバーの外から、Caddy を通らずに app に届かない。
   - app の `TRUSTED_PROXIES` には `CADDY_IP` が入る（`.env` の `TRUSTED_PROXIES` は使わない）。信頼するのは Caddy の IP だけで、範囲は信頼しない。サーバー自身から開いたときや Docker Desktop では、利用者がネットワークのゲートウェイから来たように見える。範囲を信頼するとゲートウェイも信頼し、利用者が付けた偽の `X-Forwarded-For` を信じてしまう。

2. `docker compose up -d --wait` で起動する。`APP_URL` を開き、ログインできることを確かめる。HTTP（80）で開くと HTTPS に移る。

- 起動に失敗して `container ... caddy-1 is unhealthy` と出たら、`docker compose logs caddy` を見る。`CADDY_TLS` が空か書き方が違う、`APP_URL` の形が違う（末尾の `/` など）ことが多い。
- 起動はしたが HTTPS でつながらないときも、`docker compose logs caddy` を見る。Let's Encrypt から証明書を取れないとき（9.4）は、設定は読めているので起動には成功する。
- Docker Desktop で動かす場合や、IPv6 で届いた接続では、利用者全員が同じ1つの IP（ネットワークのゲートウェイ）に見える。ログインの回数制限が全員で共有され、操作ログの IP で端末を区別できない。HTTPS にしたせいではなく、前からある性質である。本番は Linux の Docker Engine で、IPv4 で受けるのがよい。
- 自分で用意したプロキシの後ろに置くときに `TRUSTED_PROXIES` を書かないと、全員がプロキシと同じ IP に見え、ログインの回数制限（Better Auth の `rateLimit`）で全員が締め出されることがある。
- `TRUSTED_PROXIES` の値は、Better Auth の `advanced.ipAddress.trustedProxies`（1.7 の安定版にある）に渡す。アプリは、Better Auth に渡す前に転送のヘッダを付け直す。Caddy は、利用者が付けてきた `X-Forwarded-For` を捨てて付け直す。
- Caddy 以外のリバースプロキシを使うときも考え方は同じである。app のポートを外に出さず、`TRUSTED_PROXIES` にプロキシのアドレスだけを書き、プロキシに転送のヘッダを付け直させる。

### 9.2 `internal`：ルート証明書を端末に信頼させる

Caddy が自分の認証局を作り、サーバーの証明書を出す（期限が来る前に自動で出し直す）。利用者の端末に、その認証局のルート証明書を信頼させる。

1. ルート証明書を取り出す：`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./tadori-root.crt`
2. 利用者の端末に配り、信頼させる。

   | 端末 | 信頼のさせ方 |
   |---|---|
   | Windows（Chrome・Edge） | 管理者の権限のコマンドプロンプトで `certutil -addstore -f Root tadori-root.crt`。またはファイルを開き「証明書のインストール」→「ローカル コンピューター」→「信頼されたルート証明機関」。社内ならグループポリシーで配れる |
   | macOS | キーチェーンアクセスの「システム」に入れ、「常に信頼」にする（`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain tadori-root.crt`） |
   | Linux | `/usr/local/share/ca-certificates/tadori-root.crt` に置き、`sudo update-ca-certificates`（Debian・Ubuntu の場合）。Chrome・Chromium は自分の置き場（NSS）を見ることが多いので、`certutil -d sql:$HOME/.pki/nssdb -A -t C,, -n tadori -i tadori-root.crt`（`libnss3-tools` に入っている）も行う |
   | Firefox | Windows と macOS では、OS に入れたルート証明書を既定で取り込む（Firefox 120 以降。`security.enterprise_roots.enabled`）。Linux では取り込まないので、「設定」→「証明書を表示」→「認証局証明書」で読み込む |

3. ブラウザを開き直し、`APP_URL` を警告なしに開けることを確かめる。

- ルート証明書は `caddy-data` のボリュームに入っている。**このボリュームを消すと（`docker compose down -v` など）、ルート証明書が作り直され、全端末で入れ直しになる。**
- ルート証明書には期限がある（Caddy の既定で約10年）。期限が近づいたら、新しいものを配り直す。
- このルート証明書の秘密鍵を持つ人は、どのサイトの証明書でも作れてしまう。`caddy-data` のボリュームはサーバーの管理者だけが触れるようにする。

### 9.3 持ち込み：発行してもらった証明書を置く

社内の認証局のルート証明書がすでに端末に配られている会社では、サーバーの証明書を発行してもらって置くだけで済み、新しいルート証明書を配らなくてよい。

1. リポジトリの `./certs` に、証明書と秘密鍵を PEM の形で置く（例：`tadori.crt`・`tadori.key`）。証明書の名前（SAN）には `APP_URL` のホスト名を入れてもらう。
   - Linux では、`./certs` がないまま caddy を一度でも起動すると、Docker が root の持ち物で作り、そのままでは書き込めない。先に `mkdir certs` しておくか、root のものになっていたら `sudo chown` で自分のものにする。
   - 証明書のファイルには、サーバーの証明書の後ろに中間証明書をつなげて入れる（`cat server.crt intermediate.crt > certs/tadori.crt`）。つなげないと、端末によっては信頼されない。
   - 秘密鍵は、サーバーの管理者だけが読める権限にする（Linux なら `chmod 600`）。`./certs` はコミットしない（`.gitignore` に入っている）。
2. `.env` を `CADDY_TLS=/certs/tadori.crt /certs/tadori.key` にし、9.1 の手順で起動する。

- 置いた証明書は自動では更新されない。**期限の前に**新しい証明書を同じ名前で置き直し、`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --force` で読み込み直す（止めずに切り替わる）。**`--force` を忘れない**。ファイルの名前が同じなので設定は変わらず、`--force` がないと Caddy は読み込み直さない（エラーも出ず、古い証明書のまま期限が切れる）。
- 置いたファイルの期限は `openssl x509 -in certs/tadori.crt -noout -enddate`、Caddy が実際に出している証明書の期限は `openssl s_client -connect <サーバーの名前>:443 -servername <サーバーの名前> </dev/null | openssl x509 -noout -enddate` で見られる。差し替えた後は、後者が新しい期限になったことを確かめる。

### 9.4 Let's Encrypt：インターネットに公開する

1. `APP_URL` のホスト名の DNS を、サーバーの公開の IP に向ける。ポート 80 と 443 が、インターネットからサーバーに届くようにする（証明書を取るときに Let's Encrypt から確かめに来る）。
2. `.env` を `CADDY_TLS=<連絡用のメールアドレス>` にし、9.1 の手順で起動する。Caddy が証明書を取り、期限の前に自動で取り直す。

### 9.5 HTTP から移す・ほかの環境とぶつかる

- HTTP で動かしていた環境を HTTPS に移すと、`APP_URL` が変わるので、全員がログインし直すことになる。その場でバックアップを取ってから（5.2）切り替える。
- Caddy と app だけがつながるネットワーク（`proxy`）の範囲は、既定で `10.203.53.0/24` にしてある。社内 LAN や、同じホストで動かす別の環境と範囲がぶつかって起動できないときは、`.env` の `PROXY_SUBNET`・`PROXY_IP_RANGE`・`CADDY_IP` の3つをそろえて変える（app の `TRUSTED_PROXIES` は `CADDY_IP` に自動で合う）。エラーは `Pool overlaps with other one on this address space` のように出る。社内 LAN と重なったときは、エラーにならず、その範囲の端末から届かなくなることがある。
  - `CADDY_IP` は `PROXY_IP_RANGE`（app などに自動で割り当てる範囲）の外にする。重なると、app が先にその IP を取り、Caddy が起動できない。
- このネットワークは、`compose.https.yaml` を足したときだけできる。HTTP で動かす環境には影響しない。

## 10. ログ

- アプリのログは標準出力に出る（1行に1つの JSON）。`docker compose logs app` で見る。
- 保持はコンテナのログの設定に任せる。compose で各コンテナのログを json-file の `max-size: 10m`・`max-file: 5`（1つのコンテナで最大 50MB）にし、ディスクを使い切らないようにする。

## 11. 気をつけること

- `docker compose down -v` は DB のボリュームを消す。データがすべて消えるので、使わない（止めるだけなら `docker compose down` か `stop`）。
- バックアップのディレクトリは、可能なら別のディスクや別のマシンにも写す。同じディスクが壊れると、DB とバックアップが一緒に失われる。
- ダンプには、パスワードのハッシュ、セッションのトークン、下書きを含む DB の中身がすべて入る。DB と同じ扱いにし、バックアップのディレクトリはサーバーの管理者だけが読めるようにする。別の場所に写すときも同じにする。backup コンテナはダンプを root の持ち物・所有者だけが読める権限（`600`）で作る（Linux のホストでは読むのに sudo が要る）。

## 12. リリースする（開発者向け）

版は SemVer で付ける。メジャーは版上げに手作業が要る変更（`.env` の必須の項目が増える、など）、マイナーは機能の追加、パッチは修正。

1. ルートの `package.json` の `version` を上げる PR を作り、マージする。
2. main で `git tag vX.Y.Z` を付け、`git push origin vX.Y.Z` で送る。
3. GitHub Releases にそのタグでリリースを作り、変更点を書く。手作業が要る変更は、手順と一緒に先頭に書く。
