import { maskSecrets, SECRET_MASK, splitVariables } from "@tadori/shared";

// 実行手順書の表示とコピー（D-23）、入力のマスク（D-02、D-56）。

export type RenderContext = {
  /** 秘密でない変数の値（実行の詳細の variables） */
  values: Readonly<Record<string, string>>;
  /** 秘密変数の名前（版の変数の定義から） */
  secretNames: readonly string[];
  /** 秘密変数の値（置き場から。未入力なら undefined） */
  secrets?: Readonly<Record<string, string>>;
  /** 秘密変数の値を見せるか（「表示」の切り替え） */
  reveal: boolean;
};

export type ExecPiece =
  | { type: "text"; text: string }
  | { type: "value"; name: string; text: string }
  | { type: "secret"; name: string; text: string; masked: boolean };

/** 版の文字列を、置換した表示の部品に分ける。秘密変数は値があって reveal のときだけ値を見せる。 */
export function renderPieces(text: string, ctx: RenderContext): ExecPiece[] {
  return splitVariables(text).map((s): ExecPiece => {
    if (s.type === "text") return s;
    if (ctx.secretNames.includes(s.name)) {
      const value = ctx.secrets?.[s.name];
      return value !== undefined && ctx.reveal
        ? { type: "secret", name: s.name, text: value, masked: false }
        : { type: "secret", name: s.name, text: SECRET_MASK, masked: true };
    }
    return { type: "value", name: s.name, text: ctx.values[s.name] ?? `#{${s.name}}` };
  });
}

/** コピーする文字列。秘密変数は表示にかかわらず値で置き換え、値が入力されていなければ null。 */
export function textForCopy(text: string, ctx: RenderContext): string | null {
  let out = "";
  for (const s of splitVariables(text)) {
    if (s.type === "text") {
      out += s.text;
    } else if (ctx.secretNames.includes(s.name)) {
      const value = ctx.secrets?.[s.name];
      if (value === undefined) return null;
      out += value;
    } else {
      out += ctx.values[s.name] ?? `#{${s.name}}`;
    }
  }
  return out;
}

/** 実行者が入力したテキストを送る前に、秘密変数の値をマスクする。 */
export function maskInput(text: string, secrets?: Readonly<Record<string, string>>): string {
  return maskSecrets(text, Object.values(secrets ?? {}));
}
