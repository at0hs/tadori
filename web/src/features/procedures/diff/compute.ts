import type { ProcedureContent, ProcedureStep, ProcedureVariable } from "@tadori/shared";
import { diffArrays } from "diff";

// 下書きと最新版の差分（F-11、D-66）。API は足さず、画面で計算する。
// ステップは id、変数は name で突き合わせ、手順と切り戻し手順は別々に比べる。

export type DiffKind = "same" | "add" | "del";
export type TextPart = { kind: DiffKind; text: string };
/** 1行。kind が same 以外の行で、対になる行があれば parts に行の中の違いが入る。なければ1つの部品。 */
export type LinePart = { kind: DiffKind; parts: TextPart[] };
export type ItemStatus = "same" | "add" | "del" | "mod";

export type StepDiff = {
  id: string;
  status: ItemStatus;
  /** 両方にあり、並びの最長共通部分列に入らない。status が same でも mod でも true になりうる */
  moved: boolean;
  /** 最新版での番号（1始まり）。追加なら null */
  oldNo: number | null;
  /** 下書きでの番号。削除なら null */
  newNo: number | null;
  title: TextPart[];
  description: TextPart[];
  command: LinePart[];
  verification: TextPart[];
  /** 追加は before が null、削除は after が null */
  evidenceRequired: { before: boolean | null; after: boolean | null };
};
export type VariableDiff = {
  name: string;
  status: ItemStatus;
  before: ProcedureVariable | null;
  after: ProcedureVariable | null;
  description: TextPart[];
};
export type TagDiff = { tag: string; kind: DiffKind };
export type ProcedureDiff = {
  title: TextPart[];
  summary: TextPart[];
  /** 下書きの順、その後に消えたタグを最新版の順で */
  tags: TagDiff[];
  prerequisites: LinePart[];
  /** 下書きの順。消えた変数は、最新版でその後ろにあり下書きにも残る最初の変数の直前（なければ最後） */
  variables: VariableDiff[];
  steps: StepDiff[];
  rollbackSteps: StepDiff[];
  /** どこかに違いがあるか */
  changed: boolean;
};

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

/** 単語の区切りで割る。空白・改行も1つの部品として残す（つなげば元の文に戻る）。 */
function tokenize(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/**
 * 文の差分。same＋del をつなぐと前の文、same＋add をつなぐと後の文になる。
 * jsdiff の diffWords は空白を無視して比べるので使わず、部品の配列を diffArrays で比べる
 * （コマンドの空白の違いも見せるため）。
 */
export function textDiff(before: string, after: string): TextPart[] {
  if (before === after) return before === "" ? [] : [{ kind: "same", text: before }];
  const parts: TextPart[] = [];
  for (const c of diffArrays(tokenize(before), tokenize(after))) {
    const kind: DiffKind = c.added ? "add" : c.removed ? "del" : "same";
    const text = c.value.join("");
    if (text === "") continue;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  }
  return parts;
}

/** 行に割る。両方が改行で終わるときだけ末尾の改行を1つ落とし、片方だけなら空の行として違いが残る。 */
function splitLines(text: string, dropTrailingNewline: boolean): string[] {
  const t = dropTrailingNewline ? text.slice(0, -1) : text;
  return t === "" && !dropTrailingNewline ? [] : t.split("\n");
}

/** 行の差分。削除の行の直後に同じ数の追加の行が続くところは、i 番目同士の行の中の違いを入れる。 */
export function lineDiff(before: string, after: string): LinePart[] {
  if (before === "" && after === "") return [];
  const both = before.endsWith("\n") && after.endsWith("\n");
  const a = splitLines(before, both);
  const b = splitLines(after, both);
  const chunks = diffArrays(a, b);
  const lines: LinePart[] = [];
  for (let k = 0; k < chunks.length; k++) {
    const c = chunks[k];
    if (!c) break;
    if (!c.added && !c.removed) {
      for (const text of c.value) lines.push({ kind: "same", parts: [{ kind: "same", text }] });
      continue;
    }
    const next = chunks[k + 1];
    if (c.removed && next?.added && next.value.length === c.value.length) {
      const pairs = c.value.map((text, i) => textDiff(text, next.value[i] ?? ""));
      for (const parts of pairs)
        lines.push({ kind: "del", parts: parts.filter((p) => p.kind !== "add") });
      for (const parts of pairs)
        lines.push({ kind: "add", parts: parts.filter((p) => p.kind !== "del") });
      k++;
      continue;
    }
    const kind = c.added ? "add" : "del";
    for (const text of c.value) lines.push({ kind, parts: [{ kind: "same", text }] });
  }
  return lines;
}

export function isChanged(parts: TextPart[] | LinePart[]): boolean {
  return parts.some((p) => p.kind !== "same");
}

/** 片方にしかない項目の文。違いの印は項目の status で出すので、中身は same の1つにする。 */
const plain = (text: string): TextPart[] => (text === "" ? [] : [{ kind: "same", text }]);
const plainLines = (text: string): LinePart[] => lineDiff(text, text);

/**
 * 両方にある ID の並びの最長共通部分列に入らないものを返す。
 * 長さが同じ候補が複数あるときは下書きの側を進め、前へ動かしたものを移動にする。
 */
function movedIds(oldIds: string[], newIds: string[]): Set<string> {
  const inNew = new Set(newIds);
  const inOld = new Set(oldIds);
  const a = oldIds.filter((id) => inNew.has(id));
  const b = newIds.filter((id) => inOld.has(id));
  // L(i, j)：最新版の i 番目以降と下書きの j 番目以降の最長共通部分列の長さ
  const w = b.length + 1;
  const table = new Array<number>((a.length + 1) * w).fill(0);
  const L = (i: number, j: number) => table[i * w + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j] ? L(i + 1, j + 1) + 1 : Math.max(L(i + 1, j), L(i, j + 1));
    }
  }
  const lcs = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const id = a[i];
    if (id !== undefined && id === b[j]) {
      lcs.add(id);
      i++;
      j++;
    } else if (L(i + 1, j) > L(i, j + 1)) {
      i++;
    } else {
      j++;
    }
  }
  return new Set(b.filter((id) => !lcs.has(id)));
}

/**
 * 下書きの順に並べ、消えたものは「最新版でその後ろにあり、下書きにも残っていて anchorable な最初のもの」の直前に入れる。
 */
function mergeOrder<T>(
  oldKeys: string[],
  newKeys: string[],
  anchorable: (key: string) => boolean,
  make: (key: string) => T,
): T[] {
  const inNew = new Set(newKeys);
  const before = new Map<string, string[]>();
  const tail: string[] = [];
  let pending: string[] = [];
  for (const key of oldKeys) {
    if (!inNew.has(key)) {
      pending.push(key);
    } else if (pending.length > 0 && anchorable(key)) {
      before.set(key, pending);
      pending = [];
    }
  }
  tail.push(...pending);
  const out: T[] = [];
  for (const key of newKeys) {
    for (const d of before.get(key) ?? []) out.push(make(d));
    out.push(make(key));
  }
  for (const d of tail) out.push(make(d));
  return out;
}

function stepChanged(a: ProcedureStep, b: ProcedureStep): boolean {
  return (
    a.title !== b.title ||
    a.description !== b.description ||
    a.command !== b.command ||
    a.verification !== b.verification ||
    a.evidenceRequired !== b.evidenceRequired
  );
}

function diffSteps(base: ProcedureStep[], draft: ProcedureStep[]): StepDiff[] {
  const oldById = new Map(base.map((s, i) => [s.id, { step: s, no: i + 1 }]));
  const newById = new Map(draft.map((s, i) => [s.id, { step: s, no: i + 1 }]));
  const moved = movedIds(
    base.map((s) => s.id),
    draft.map((s) => s.id),
  );
  return mergeOrder(
    base.map((s) => s.id),
    draft.map((s) => s.id),
    (id) => !moved.has(id),
    (id): StepDiff => {
      const o = oldById.get(id);
      const n = newById.get(id);
      if (o && n) {
        const a = o.step;
        const b = n.step;
        return {
          id,
          status: stepChanged(a, b) ? "mod" : "same",
          moved: moved.has(id),
          oldNo: o.no,
          newNo: n.no,
          title: textDiff(a.title, b.title),
          description: textDiff(a.description, b.description),
          command: lineDiff(a.command, b.command),
          verification: textDiff(a.verification, b.verification),
          evidenceRequired: { before: a.evidenceRequired, after: b.evidenceRequired },
        };
      }
      // どちらか片方にだけある
      const s = (n ?? o)?.step as ProcedureStep;
      return {
        id,
        status: n ? "add" : "del",
        moved: false,
        oldNo: o?.no ?? null,
        newNo: n?.no ?? null,
        title: plain(s.title),
        description: plain(s.description),
        command: plainLines(s.command),
        verification: plain(s.verification),
        evidenceRequired: {
          before: o ? s.evidenceRequired : null,
          after: n ? s.evidenceRequired : null,
        },
      };
    },
  );
}

function diffVariables(base: ProcedureVariable[], draft: ProcedureVariable[]): VariableDiff[] {
  const oldByName = new Map(base.map((v) => [v.name, v]));
  const newByName = new Map(draft.map((v) => [v.name, v]));
  return mergeOrder(
    base.map((v) => v.name),
    draft.map((v) => v.name),
    () => true,
    (name): VariableDiff => {
      const before = oldByName.get(name) ?? null;
      const after = newByName.get(name) ?? null;
      if (before && after) {
        const mod =
          before.description !== after.description ||
          before.default !== after.default ||
          before.secret !== after.secret;
        return {
          name,
          status: mod ? "mod" : "same",
          before,
          after,
          description: textDiff(before.description, after.description),
        };
      }
      const v = (after ?? before) as ProcedureVariable;
      return {
        name,
        status: after ? "add" : "del",
        before,
        after,
        description: plain(v.description),
      };
    },
  );
}

function diffTags(base: string[], draft: string[]): TagDiff[] {
  const inOld = new Set(base);
  const inNew = new Set(draft);
  return [
    ...draft.map((tag): TagDiff => ({ tag, kind: inOld.has(tag) ? "same" : "add" })),
    ...base.filter((tag) => !inNew.has(tag)).map((tag): TagDiff => ({ tag, kind: "del" })),
  ];
}

export function diffProcedure(base: ProcedureContent, draft: ProcedureContent): ProcedureDiff {
  const title = textDiff(base.title, draft.title);
  const summary = textDiff(base.summary, draft.summary);
  const tags = diffTags(base.tags, draft.tags);
  const prerequisites = lineDiff(base.prerequisites, draft.prerequisites);
  const variables = diffVariables(base.variables, draft.variables);
  const steps = diffSteps(base.steps, draft.steps);
  const rollbackSteps = diffSteps(base.rollbackSteps, draft.rollbackSteps);
  const changed =
    isChanged(title) ||
    isChanged(summary) ||
    isChanged(prerequisites) ||
    tags.some((t) => t.kind !== "same") ||
    variables.some((v) => v.status !== "same") ||
    [...steps, ...rollbackSteps].some((s) => s.status !== "same" || s.moved);
  return { title, summary, tags, prerequisites, variables, steps, rollbackSteps, changed };
}
