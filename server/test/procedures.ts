import { newId, type ProcedureContent, type ProcedureStep } from "@tadori/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.ts";
import { procedureDrafts, procedures, procedureVersions } from "../src/db/schema/procedures.ts";

// 手順書のテストの補助。データはすべてダミー。

export function sampleStep(overrides: Partial<ProcedureStep> = {}): ProcedureStep {
  return {
    id: newId(),
    title: "設定ファイルのバックアップ",
    description: "",
    command: "ssh #{host} sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak",
    verification: "",
    evidenceRequired: false,
    ...overrides,
  };
}

export function sampleContent(overrides: Partial<ProcedureContent> = {}): ProcedureContent {
  return {
    title: "nginx の設定変更",
    summary: "web01 の nginx の worker 数を変更する",
    tags: ["nginx", "web"],
    prerequisites: "メンテナンス時間内であること",
    variables: [
      { name: "host", description: "対象ホスト", default: "web01.example.test", secret: false },
    ],
    steps: [sampleStep()],
    rollbackSteps: [],
    ...overrides,
  };
}

/**
 * API を通さずに手順書を DB に入れる（読み込みのテスト用）。
 * versions を順に v1, v2, … として入れ、draft があれば下書きも入れる。
 */
export async function insertProcedure(opts: {
  createdBy: string;
  versions?: ProcedureContent[];
  draft?: ProcedureContent;
  draftBy?: string;
  archived?: boolean;
}): Promise<string> {
  const versions = opts.versions ?? [];
  const [row] = await db
    .insert(procedures)
    .values({ createdBy: opts.createdBy, latestVersionNo: versions.length || null })
    .returning({ id: procedures.id });
  if (!row) throw new Error("手順書を作れなかった");
  const id = row.id;
  const base = new Date("2026-11-01T00:00:00.000Z").getTime();
  for (const [i, content] of versions.entries()) {
    await db.insert(procedureVersions).values({
      procedureId: id,
      versionNo: i + 1,
      content,
      changeReason: i === 0 ? "最初の版" : `${i + 1} 版の変更`,
      publishedBy: opts.createdBy,
      publishedAt: new Date(base + i * 86_400_000),
    });
  }
  if (opts.draft) {
    const by = opts.draftBy ?? opts.createdBy;
    await db.insert(procedureDrafts).values({
      procedureId: id,
      baseVersionNo: versions.length || null,
      content: opts.draft,
      revision: 1,
      createdBy: by,
      updatedBy: by,
    });
  }
  if (opts.archived) {
    await db
      .update(procedures)
      .set({ status: "archived", archivedBy: opts.createdBy, archivedAt: new Date() })
      .where(eq(procedures.id, id));
  }
  return id;
}
