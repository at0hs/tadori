import { useSyncExternalStore } from "react";

// 秘密変数の値の置き場（D-41、screens.md 6章）。
// ブラウザのメモリ（このモジュールの中の Map）だけに置き、サーバーにも Web Storage にも出さない。
// 再読み込み・ログアウト・セッション切れで消え、再開時に入力し直す。ほかのコードは Map を直接触らない。

type Secrets = Readonly<Record<string, string>>;

const store = new Map<string, Secrets>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function getSecrets(executionId: string): Secrets | undefined {
  return store.get(executionId);
}

export function setSecrets(executionId: string, values: Record<string, string>): void {
  store.set(executionId, Object.freeze({ ...values }));
  notify();
}

/** すべての実行の値を消す（ログアウト・セッション切れ）。 */
export function clearSecrets(): void {
  store.clear();
  notify();
}

export function subscribeSecrets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 実行の秘密変数の値。入力されていなければ undefined。 */
export function useSecrets(executionId: string): Secrets | undefined {
  return useSyncExternalStore(subscribeSecrets, () => getSecrets(executionId));
}
