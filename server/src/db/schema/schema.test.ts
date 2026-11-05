import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../client.ts";

describe("DB のスキーマ", () => {
  it("タイムゾーンなしの timestamp の列がない（D-59）", async () => {
    const result = await db.execute<{ table_name: string; column_name: string }>(sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type = 'timestamp without time zone'
    `);
    expect(result.rows).toEqual([]);
  });
});
