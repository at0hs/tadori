import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.ts";

// マイグレーションは起動時に自動で流す（D-10）。前に進めるだけで、戻すものは作らない（D-50）。
export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
