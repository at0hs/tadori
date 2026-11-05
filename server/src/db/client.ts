import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.ts";
import { authRelations } from "./schema/auth.ts";

export const pool = new Pool({ connectionString: config.DATABASE_URL });

// Drizzle 1.0 では schema と casing を渡せない。relations を渡す（D-13 の補足）。
export const db = drizzle({ client: pool, relations: { ...authRelations } });

export type Db = typeof db;
