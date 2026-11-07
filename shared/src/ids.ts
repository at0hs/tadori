import { v7 } from "uuid";

/** アプリのテーブルとステップの ID（D-27）。UUID v7 をアプリ側で振る。 */
export function newId(): string {
  return v7();
}
