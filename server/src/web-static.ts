import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type MiddlewareHandler } from "hono";

// 一番外のアプリ（D-10）。/api は API に、それ以外はビルドした画面に渡す。
// 画面の URL（/executions/… など）は、ファイルがなければ index.html を返し、画面のルーターに任せる。

type FetchApp = {
  fetch: (request: Request, env: never) => Response | Promise<Response>;
};

// ファイル名にハッシュが付くので、長く持たせてよい
const IMMUTABLE = "public, max-age=31536000, immutable";

// serveStatic の onFound は応答を作った後に呼ばれ、ヘッダを付けられない。返した後で付ける。
// assets の下以外（index.html など）は、版を上げた直後に古い画面が残らないよう、毎回確かめさせる。
const cacheControl: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.status === 200) {
    c.res.headers.set("Cache-Control", c.req.path.startsWith("/assets/") ? IMMUTABLE : "no-cache");
  }
};

export function createRootApp(options: { api: FetchApp; distDir?: string }): Hono {
  const { api, distDir } = options;
  const root = new Hono();

  // env には接続元の情報（@hono/node-server の incoming）が入っている。IP の取得に要るので、そのまま渡す。
  const toApi = (c: Context) => api.fetch(c.req.raw, c.env as never);
  root.all("/api", toApi);
  root.all("/api/*", toApi);

  if (distDir !== undefined) {
    root.use("*", cacheControl);
    root.get("/assets/*", serveStatic({ root: distDir }));
    // assets の下にないものは index.html にしない（古い画面が消えたファイルを読もうとしたとき）
    root.get("/assets/*", (c) => c.notFound());
    root.get("*", serveStatic({ root: distDir }));
    root.get("*", serveStatic({ root: distDir, path: "index.html" }));
  }

  return root;
}
