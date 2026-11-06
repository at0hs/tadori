// E2E（web/e2e）用に API を起動する。テスト用 DB を空にしてマイグレーションしてから、
// ふだんの起動（src/index.ts）を動かす。環境変数は web/playwright.config.ts の webServer が渡す。
import { setup } from "./global-setup.ts";

await setup();
await import("../src/index.ts");
