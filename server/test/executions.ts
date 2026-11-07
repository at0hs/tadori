import type { ProcedureContent } from "@tadori/shared";
import { expect } from "vitest";
import { readJson, request } from "./helpers.ts";
import { insertProcedure, sampleContent, sampleStep } from "./procedures.ts";

// 実行のテストの補助。データはすべてダミー。

/** 変数（host・port・秘密の admin_password）、手順3つ（2つ目はエビデンス必須）、切り戻し1つの文書。 */
export function execContent(overrides: Partial<ProcedureContent> = {}): ProcedureContent {
  return sampleContent({
    variables: [
      { name: "host", description: "対象ホスト", default: "web01.example.test", secret: false },
      { name: "port", description: "SSH のポート", default: "22", secret: false },
      { name: "admin_password", description: "管理者のパスワード", default: null, secret: true },
    ],
    steps: [
      sampleStep({ title: "設定ファイルのバックアップ", command: "ssh #{host} -p #{port}" }),
      sampleStep({
        title: "設定の反映",
        command: "echo #{admin_password} | sudo -S systemctl reload nginx",
        evidenceRequired: true,
      }),
      sampleStep({ title: "動作の確認", command: "curl -I http://#{host}/" }),
    ],
    rollbackSteps: [sampleStep({ title: "設定を戻す", command: "ssh #{host} sudo cp a.bak a" })],
    ...overrides,
  });
}

/** 公開済み（v1）の手順書を DB に直接入れる。 */
export function publishedProcedure(authorId: string, content: ProcedureContent = execContent()) {
  return insertProcedure({ createdBy: authorId, versions: [content] });
}

export const DEFAULT_VALUES = { host: "web01.example.test", port: "22" };

/** API で実行を開始して ID を返す。 */
export async function startRun(
  cookie: string,
  procedureId: string,
  overrides: { versionNo?: number; variables?: Record<string, string> } = {},
): Promise<string> {
  const res = await request("/api/executions", {
    cookie,
    json: {
      procedureId,
      versionNo: overrides.versionNo ?? 1,
      variables: overrides.variables ?? DEFAULT_VALUES,
    },
  });
  if (res.status !== 201)
    throw new Error(`実行を開始できなかった：${res.status} ${await res.text()}`);
  return (await readJson(res)).id;
}

/** 実行の詳細を取る。 */
export async function detail(cookie: string, id: string) {
  const res = await request(`/api/executions/${id}`, { cookie });
  expect(res.status).toBe(200);
  return readJson(res);
}
