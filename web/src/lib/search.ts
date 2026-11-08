import { z } from "zod";

/**
 * 検索条件の ID（?executor=… など）。ルーターは値を JSON として読むので、?executor=123 は数になる。
 * 捨てると絞り込みが外れて全件が出てしまうため、数は文字列に戻す（該当なしになる）。それ以外の型は指定なし。
 */
export const idSearchParam = z
  .union([z.string(), z.number().transform(String)])
  .optional()
  .catch(undefined);
