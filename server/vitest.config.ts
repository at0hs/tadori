import { defineProject } from "vitest/config";
import { TEST_ENV } from "./test/env.ts";

export default defineProject({
  test: {
    name: "server",
    env: TEST_ENV,
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // テスト用の DB を1つ共有するので、ファイルを並べて流さない。
    fileParallelism: false,
  },
});
