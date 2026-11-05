import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { migrationsFolder } from "../src/db/migrate.ts";
import { TEST_ENV } from "./env.ts";

// テスト用の DB を空にしてから、マイグレーションを流す。
export async function setup() {
  const pool = new Pool({ connectionString: TEST_ENV.DATABASE_URL });
  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
