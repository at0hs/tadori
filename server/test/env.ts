// テストの環境変数（すべてダミー）。DB は compose.dev.yaml の db-test（CI ではサービスコンテナ）。
export const TEST_ENV = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  APP_URL: "http://localhost:5173",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://tadori:tadori-test@localhost:5434/tadori_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
};
