# app のイメージ（operations.md 2章）。API とビルドした画面を1つのポートで配信する（D-10）。
# server と shared はビルドしない（Node が .ts の型を消して動かす）。Node は node_modules の中の .ts を
# 動かさないため、pnpm deploy は使わず、ワークスペースの並び（シンボリックリンク）のまま入れる。

# コミットの SHA（画面の「Tadori について」、D-69）。.git がなければ unknown にして、ビルドは止めない。
# .gi[t] は、.git がないときに何も選ばず COPY を失敗させないためのワイルドカード。
# ディレクトリは中身が写るので、/src をそのまま git のディレクトリとして読む。
# ビルドする人と .git の持ち主が違っても読めるよう、safe.directory を付ける。
FROM alpine/git:v2.52.0 AS commit
COPY package.json .gi[t] /src/
RUN (git --git-dir=/src -c safe.directory='*' rev-parse --short=7 HEAD 2>/dev/null || echo unknown) > /COMMIT

FROM node:26-slim AS base
WORKDIR /app
# pnpm の版は package.json の packageManager に合わせる（Node 26 には corepack がない）
COPY package.json ./
RUN npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")" \
  && npm cache clean --force
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY shared/package.json shared/
COPY web/package.json web/

# 1段目：すべての依存を入れて画面をビルドする
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN pnpm build

# 2段目：server の本番の依存だけを入れる
FROM base AS runtime
ENV NODE_ENV=production
RUN pnpm install --prod --frozen-lockfile --filter "@tadori/server..." \
  && pnpm store prune
COPY shared shared
COPY server server
COPY --from=build /app/web/dist web/dist
COPY --from=commit /COMMIT COMMIT
ENV WEB_DIST_DIR=/app/web/dist \
  PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/src/index.ts"]
