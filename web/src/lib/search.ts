import { z } from "zod";

// 検索条件の読み取り。ルーターは値を JSON として読むので、?executor=123 は数に、
// ?status=running は（配列でなく）1つの文字列になる。手で打った URL でも絞り込みが外れないようにする。

/** 文字列の値。数として読まれたものは文字列に戻す。 */
const stringParam = z.union([z.string(), z.number().transform(String)]);

/**
 * 検索条件の ID（?executor=… など）。捨てると絞り込みが外れて全件が出てしまうため、
 * 数は文字列に戻す（該当なしになる）。それ以外の型は指定なし。
 */
export const idSearchParam = stringParam.optional().catch(undefined);

/** 複数選べる検索条件。1つだけの値は1件の配列にする。合わない値があれば指定なし（空）。 */
export function listSearchParam<T extends z.ZodType>(item: T) {
  return z
    .union([z.array(item), item.transform((v) => [v])])
    .default([])
    .catch([]);
}

/** 複数選べる文字列の検索条件（?tag=…）。 */
export const stringListSearchParam = listSearchParam(stringParam);
