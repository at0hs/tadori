# ロールの4段階化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ロールを「1人1つ・4段階（管理者 ＞ 承認者 ＞ 作業者 ＞ 閲覧者）」に作り替え、手順書の公開・アーカイブを承認者以上にする。

**Architecture:** `shared/` に、ロールの並びと「操作 → 必要な最も低いロール」の対応表（`PERMISSIONS`）と判定関数 `can(role, permission)` を1か所だけ置き、サーバーのミドルウェア `requirePermission`・サービス・画面のすべてがこれを使う。`user_roles` は1人1行（`user_id` が主キー）にし、行がなければ閲覧者として扱う。ロールの変更は `PUT /api/admin/users/{id}/role` の1つにする。

**Tech Stack:** TypeScript（Node 26、型を消すだけ）、Hono、Drizzle 1.0 RC、Zod、Vitest、React ＋ TanStack Router/Query、shadcn/ui（Base UI）、Playwright。

**Spec:**
- `../tadori-docs/requirements.md` 1.2（3章、F-01、F-05、F-08）
- `../tadori-docs/design/decisions.md` D-64・D-65（D-08・D-33〜D-36・D-38 の読み替えの注記）
- `../tadori-docs/design/authorization.md`（認可マトリクス）、`api.md` 3章・4.2・4.3・4.6、`data-model.md` 4.1、`conventions.md` 4.2・4.4、`screens.md`、`ui.md` 5.4・7.5・9章

**ブランチ:** `feat/four-level-roles`（main から切る）

## Global Constraints

- ロールの値は `admin` / `approver` / `worker` / `viewer`。表示名は 管理者・承認者・作業者・閲覧者。並びは上のロールから（`ROLES` の順＝表示の順）。
- 上のロールは下のロールの権限をすべて持つ。認可は「操作に必要な最も低いロール」とだけ比べる。対応表は `shared/src/schemas/roles.ts` の `PERMISSIONS` の1か所だけ。他の場所で `role === "admin"` のような比較を書かない（`user.role` 列への写しを除く）。
- ロールはリクエストのたびに DB から読む（D-35）。`user_roles` の行がないユーザーは閲覧者。
- 職務分離（自分が実行者の実行は承認・差し戻しできない）、本人の確認（D-35）、自分を無効化できないことは変えない。管理者は自分のロールを変更できない（同じロールを送っても 403、D-38）。
- `user.role`（admin プラグインの列）には、ロールが管理者なら `admin`、それ以外は `user` を、`user_roles` と同じトランザクションで写す（D-33）。
- `PUT /api/admin/users/{id}/role` は、すでにそのロールなら何もせず 204。操作ログは変わったときだけ `event: "user.role_changed"`、`from`・`to` を付けて出す。ユーザー作成のログは `role`（1つ）を付ける。
- 公開に職務分離はかけない（承認者は自分が保存した下書きを公開できる、D-65）。
- 適用済みのマイグレーションは書き換えない。新しいマイグレーションで移す。
- 画面のコピー（そのまま使う）：
  - ロールの選択肢の上の一文：「上のロールは、下のロールのできることをすべてできます。」
  - 説明：管理者「承認者に加えて、ユーザーの管理」／承認者「作業者に加えて、実行の承認と手順書の公開」／作業者「手順書を書く（下書き）、実行する」／閲覧者「手順書と実行記録を見るだけ」
  - S-14 で未選択のエラー：「ロールを選んでください。」（Zod のメッセージ。サーバーの 400 でも同じ）
  - S-15 の自分自身：「自分のロールは変更できません」。サーバーの 403 の detail：「自分のロールは変更できません。」
  - 閲覧者に下げる確認：見出し「{名前} を閲覧者にしますか？」、説明「閲覧者にすると、このユーザーは実行を開始・操作できなくなります。」、枠「このユーザーの実行中の実行が {N} 件あります。閲覧者にした後、管理者が実行の画面から中止できます。」、ボタン「閲覧者にする」
  - 作業者の編集画面の案内：「公開は承認者が行います。保存した下書きは、承認者のホームに出ます」
  - 権限のない画面の説明：S-08/S-09・S-10 とも「作業者以上のロールが必要です」
  - 管理者が中止できる理由（S-12 の帯・ダイアログ）：「実行者ロールを持っていない」を「ロールが閲覧者である」に置き換える

## Review Focus

1. **承認者が自分の実行を承認しようとする**：承認者は実行もできるようになったので、自分の実行の承認・差し戻しが 403 になることを確かめる → Task 3 の `approvals.test.ts`。
2. **途中で閲覧者に下げられた作業者**：次の操作（ステップの変更・終了・再依頼）が 403 になり、管理者の中止ができるようになり、詳細の `adminCanCancel` が真になる → Task 3 の `end.test.ts`・`record.test.ts`。
3. **管理者が自分で開始した実行を中止する**：実行者としての中止（理由は任意、`by: "executor"`）になり、管理者の中止の条件（実行者がブロック）に回らない → Task 3 の `end.test.ts`。
4. **`user_roles` の行がないユーザー**（作成の途中で失敗した人）：`/api/me` は `viewer`、手順書の作成は 403、その人の実行中の実行は管理者が中止できる → Task 2 の `session.test.ts`、Task 3 の `end.test.ts`。
5. **管理者 ⇄ 他のロールの変更と `user.role` の写し**：変更のたびに `adminColumnMismatches()` が空で、管理者から作業者に下げた人は管理者の API が 403 になる → Task 2 の `routes.test.ts`。

---

### Task 1: shared のロールの対応表と約束事

**Files:**
- Modify: `shared/src/schemas/roles.ts`、`shared/src/schemas/me.ts`、`shared/src/schemas/users.ts`、`shared/src/index.ts`
- Test: `shared/src/schemas/roles.test.ts`（新規）

**Interfaces:**
- Produces（以後のすべてのタスクが使う）：
  - `ROLES = ["admin", "approver", "worker", "viewer"] as const`（上から順）
  - `roleSchema = z.enum(ROLES, { error: "ロールを選んでください。" })`、`type Role`
  - `PERMISSIONS = { manageUsers: "admin", cancelAsAdmin: "admin", approve: "approver", publishProcedure: "approver", archiveProcedure: "approver", editProcedure: "worker", execute: "worker" } as const satisfies Record<string, Role>`、`type Permission = keyof typeof PERMISSIONS`
    - `editProcedure`：下書きの閲覧・作成・保存・破棄、未公開の手順書を見る（D-34）
    - `execute`：実行の開始、本人としての実行への操作、再依頼
    - `approve`：承認・差し戻し
  - `roleAtLeast(role: Role, min: Role): boolean`、`can(role: Role, permission: Permission): boolean`
  - `meResponseSchema` の `roles` を `role: roleSchema` に
  - `createUserRequestSchema` の `roles` を `role: roleSchema` に。`adminUserSchema` の `roles` を `role: roleSchema` に
  - `setRoleRequestSchema = z.object({ role: roleSchema })`、`type SetRoleRequest`
  - `userRoleParamSchema` は消す
  - `index.ts` から `PERMISSIONS`・`type Permission`・`can`・`roleAtLeast`・`setRoleRequestSchema`・`type SetRoleRequest` も出す

- [ ] **Step 1: 失敗するテストを書く**（`shared/src/schemas/roles.test.ts`）

```ts
describe("D-64 ロールの対応表", () => {
  test("上のロールは下のロールの権限をすべて持つ", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) {
      for (const [i, role] of ROLES.entries()) {
        if (can(role, p)) for (const upper of ROLES.slice(0, i)) expect(can(upper, p)).toBe(true);
      }
    }
  });
  test("D-65: 公開・アーカイブは承認者以上、下書きの編集は作業者以上", () => {
    expect(can("worker", "publishProcedure")).toBe(false);
    expect(can("approver", "publishProcedure")).toBe(true);
    expect(can("approver", "archiveProcedure")).toBe(true);
    expect(can("worker", "archiveProcedure")).toBe(false);
    expect(can("worker", "editProcedure")).toBe(true);
    expect(can("viewer", "editProcedure")).toBe(false);
  });
  test("閲覧者は何もできず、管理者はすべてできる", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can("viewer", p)).toBe(false);
      expect(can("admin", p)).toBe(true);
    }
  });
  test("ユーザーの作成はロールを1つ必須にする", () => {
    const base = { name: "テスト 太郎", username: "taro", email: "taro@example.test", password: "Passw0rd-dummy" };
    expect(createUserRequestSchema.safeParse({ ...base, role: "worker" }).success).toBe(true);
    const missing = createUserRequestSchema.safeParse(base);
    expect(missing.error?.issues[0]).toMatchObject({ path: ["role"], message: "ロールを選んでください。" });
    expect(createUserRequestSchema.safeParse({ ...base, role: "author" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `pnpm vitest run shared/src/schemas/roles.test.ts` / Expected: FAIL（`can` がない）

- [ ] **Step 3: 上の Interfaces のとおりに実装する**。`roleAtLeast` は `ROLES.indexOf(role) <= ROLES.indexOf(min)`、`can` は `roleAtLeast(role, PERMISSIONS[permission])`。`roles.ts` の冒頭のコメントに D-64・D-65 と「操作を足すときはここに書く」を書く。`users.ts` の `adminUserDetailResponseSchema` のコメントの「ロールの剥奪」は「閲覧者への変更」に直す。

- [ ] **Step 4: 通ることを確かめる** — Run: `pnpm vitest run --project shared` / Expected: PASS（server・web の型エラーは Task 2〜6 で直す）

- [ ] **Step 5: コミット** — `git commit -m "shared: ロールを4段階にし、操作ごとに必要な最も低いロールの対応表を置く（D-64・D-65）"`

---

### Task 2: user_roles を1人1行にし、ロールの読み書きと管理者の API を作り替える

**Files:**
- Modify: `server/src/db/schema/users.ts`、`server/src/lib/hono.ts`、`server/src/middleware/session.ts`、`server/src/middleware/role.ts`、`server/src/features/users/{service,routes,initial-admin,recover}.ts`、`server/src/features/me/routes.ts`、`server/test/helpers.ts`
- Create: `server/drizzle/<日時>_four_level_roles/`（custom のマイグレーション）
- Test: `server/src/middleware/session.test.ts`、`server/src/features/users/{routes,initial-admin,recover}.test.ts`、`server/src/auth/routes.test.ts`・`server/src/app.test.ts`・`server/src/middleware/csrf.test.ts`（`createUser` の呼び方だけ）
- Docs: `../tadori-docs/design/conventions.md` 6章の `event` の例

**Interfaces:**
- Consumes: Task 1 の `Role`・`roleSchema`・`Permission`・`can`・`setRoleRequestSchema`
- Produces:
  - `userRoles`：`userId uuid` 主キー・`user` への FK、`role text({ enum: ROLES }).notNull()`＋ check `user_roles_role_check`、`updatedBy uuid().notNull()` `user` への FK、`updatedAt timestamptz defaultNow notNull`
  - `Actor.role: Role`（`roles` は消す）
  - `requirePermission(permission: Permission)`（`middleware/role.ts`。`can(actor.role, permission)` でなければ `FORBIDDEN`）。`requireRole` は消す
  - `GET /api/me` は `role` を返す
  - `setRole(op: Operator, userId: string, role: Role): Promise<void>`（`features/users/service.ts`）、`PUT /api/admin/users/:id/role`（本文 `setRoleRequestSchema`、204）。`grantRole`・`revokeRole`・`syncAdminColumn` と旧ルート2つは消す
  - テストの補助 `createUser(opts: { …; role?: Role | null })`：省略時は `viewer` の行を入れ、`null` なら行を入れない（行のないユーザーのテスト用）。`isAdmin` は `role === "admin"`

> この時点では `features/procedures`・`executions`・`approvals`・`me/home` がまだ `actor.roles`・`requireRole` を使っており、型エラーとそれらのテストの失敗が残る。Task 3 で解消する。このタスクでは下の「Run」のファイルだけを流す。

- [ ] **Step 1: 失敗するテストを書く**
  - `session.test.ts`：`createUser({ role: "worker" })` でログインした `/api/me` が `role: "worker"`。`createUser({ role: null })` だと `role: "viewer"`（Review Focus 4）。既存の `roles` のテストはこの形に置き換える。
  - `users/routes.test.ts`（既存の付与・剥奪のテストは置き換える）：
    - 作成：`role: "approver"` で作ると詳細の `user.role` が `"approver"`、ログが `{ event: "user.created", role: "approver" }`。`role` なしは 400 で `errors` に `{ path: "role", message: "ロールを選んでください。" }`。`roles: ["worker"]`（古い形）・`role: "author"` も 400。
    - 変更：`PUT /api/admin/users/{id}/role` に `{ role: "approver" }` で 204、詳細が `approver`、ログ `{ event: "user.role_changed", target: { type: "user", id }, from: "worker", to: "approver" }` が1件。
    - 同じロールをもう一度送ると 204 でログなし。
    - 行のないユーザーを `viewer` にすると 204、行ができ、ログは出ない（実効のロールが変わらない）。`worker` にするとログ `from: "viewer"`。
    - 自分自身：同じロールでも別のロールでも 403、detail「自分のロールは変更できません。」。
    - 管理者 ⇄ 作業者：作業者を `admin` にすると `adminColumnMismatches()` が空で `user.role = 'admin'`。別の管理者を `worker` に下げると空のままで、下げられた人の `GET /api/admin/users` が 403（Review Focus 5）。
    - いないユーザーは 404、管理者でない人（`approver`）は 403、旧パス `PUT /api/admin/users/{id}/roles/approver` は 404。
  - `initial-admin.test.ts`：初期管理者の行が `role = 'admin'`、`updated_by = user_id`。
  - `recover.test.ts`：`worker` のユーザーを復旧すると `admin` になり `updated_by` は本人、`adminColumnMismatches()` が空。行のないユーザーでも `admin` の行ができる。ログの `adminRoleGranted` は元が管理者でなければ真。

- [ ] **Step 2: 失敗を確かめる** — Run: `pnpm vitest run server/src/middleware/session.test.ts server/src/features/users` / Expected: FAIL

- [ ] **Step 3: テーブル定義を直し、custom のマイグレーションを作る**
  - `db/schema/users.ts` を Interfaces のとおりにする（コメント：1人1行、行がなければ閲覧者、上下は `PERMISSIONS` に持つ）。
  - `pnpm --filter @tadori/server exec drizzle-kit generate --custom --name four_level_roles` で空の SQL を作り、次の順に手で書く。制約の名前は `server/drizzle/20261105153929_init/migration.sql` と、生成された snapshot の名前に合わせる。

```sql
-- 1. 1人1行に寄せる：古い5つのロールのうち一番上のもの（admin > approver > author = executor > viewer）だけ残す
DELETE FROM "user_roles" r USING "user_roles" s
WHERE r.user_id = s.user_id AND (
  CASE s.role WHEN 'admin' THEN 0 WHEN 'approver' THEN 1 WHEN 'author' THEN 2 WHEN 'executor' THEN 2 ELSE 3 END
  < CASE r.role WHEN 'admin' THEN 0 WHEN 'approver' THEN 1 WHEN 'author' THEN 2 WHEN 'executor' THEN 2 ELSE 3 END
  OR (r.role = 'executor' AND s.role = 'author'));
-- 2. 古い check を外して値を読み替える（author・executor → worker）
-- 3. 主キーを (user_id) にする、granted_by/granted_at を updated_by/updated_at に改名し、FK の名前も合わせる
-- 4. updated_by の null（初期管理者・復旧）を user_id で埋め、NOT NULL にする
-- 5. 新しい check（admin, approver, worker, viewer）を付ける
```

  - もう一度 `pnpm --filter @tadori/server exec drizzle-kit generate --name check` を流し、「変更なし」で何も生成されないことを確かめる（生成されたら SQL か snapshot の名前がずれている。消して直す）。
  - 開発用 DB（データがある）で移し替えを確かめる：`pnpm db:up` の後に server を一度起動してマイグレーションを当て、`select role, count(*) from user_roles group by role` で4つの値だけ、`select user_id from user_roles group by user_id having count(*) > 1` が0行になること（psql は `compose.dev.yaml` の開発用 DB のコンテナで開く）。

- [ ] **Step 4: 読み書きを実装する**
  - `hono.ts`：`Actor.role: Role`。`session.ts`：行を1つ読み、なければ `"viewer"`。`me/routes.ts`：`role: actor.role`。
  - `middleware/role.ts`：`requirePermission`。`features/users/routes.ts`：`.use(requirePermission("manageUsers"))`、`.put("/:id/role", pathParams(userIdParamSchema), jsonBody(setRoleRequestSchema), …)` で `setRole` を呼んで 204。
  - `service.ts`：
    - 一覧・詳細は `user_roles` を左結合して `role`（なければ `"viewer"`）。`rolesOf` と `byRoleOrder` は消す。
    - `createUser`：`isAdmin: input.role === "admin"`、行は `{ userId: id, role: input.role, updatedBy: op.actor.id }`。
    - `setRole`：トランザクションで `lockUser` → 自分なら `FORBIDDEN`（detail は Global Constraints）→ 今の行を読む → 行がないか値が違えば upsert（`onConflictDoUpdate` で `role`・`updatedBy`・`updatedAt = now()`）し、`user.role` を `role === "admin" ? "admin" : "user"` に更新 → 実効のロール（行がなければ `viewer`）が変わったときだけコミット後にログ。
  - `initial-admin.ts`：`updatedBy: id`。`recover.ts`：upsert で `role: "admin"`、`updatedBy: target.id`。`adminRoleGranted` は元の実効のロールが `admin` でなかったか。
  - `test/helpers.ts`：`createUser` を Interfaces のとおりに。
  - `auth/routes.test.ts`・`app.test.ts`・`csrf.test.ts` の `createUser({ roles: [...] })` を `role` に置き換える（`["admin"]`→`"admin"`、`["viewer"]`→`"viewer"`、`[]`→`null`、その他は意味に合わせて `worker`／`approver`）。

- [ ] **Step 5: 通ることを確かめる** — Run: `pnpm vitest run server/src/middleware server/src/features/users server/src/auth server/src/app.test.ts server/src/db` / Expected: PASS

- [ ] **Step 6: conventions.md の event の例を直す**（tadori-docs）：`user.role_granted`、`user.role_revoked` を `user.role_changed` に置き換える。tadori-docs でコミットだけする（push はユーザーに確認してから）。

- [ ] **Step 7: コミット**（tadori）— `git commit -m "server: user_roles を1人1行にし、ロールの変更を PUT /api/admin/users/{id}/role にする（D-64）"`

---

### Task 3: 各機能の認可を対応表に合わせる

**Files:**
- Modify: `server/src/features/procedures/{routes,read-service}.ts`、`server/src/features/executions/{routes,queries,end-service,read-service,start-service}.ts`、`server/src/features/approvals/{routes,service}.ts`、`server/src/features/me/home-service.ts`
- Test: `server/src/features/procedures/{write,read,concurrency}.test.ts`、`server/src/features/executions/{start,record,end,read,export,concurrency}.test.ts`、`server/src/features/approvals/approvals.test.ts`、`server/src/features/me/home.test.ts`

**Interfaces:**
- Consumes: Task 1 の `can`、Task 2 の `requirePermission`・`Actor.role`・テストの `createUser({ role })`
- Produces: `executorBlocked(ex, executorId)` は「無効化されている、または実効のロール（行がなければ `viewer`）で `execute` ができない」。ほかの関数の形は変えない。

- [ ] **Step 1: 既存のテストのロールを読み替える**：`["author"]`→`"worker"`（そのテストが API で公開・アーカイブするなら `"approver"`）、`["executor"]`・`["author","executor"]`→`"worker"`、`["approver"]`・`["approver","executor"]` など承認者を含むもの→`"approver"`、`["admin"]`→`"admin"`、`["viewer"]`→`"viewer"`。「管理者は作成者ロールがないので 403」のように古い組み合わせに頼るテストは、D-64 に合わせて期待を直すか、閲覧者で書き直す。

- [ ] **Step 2: D-64・D-65 の失敗するテストを足す**
  - `write.test.ts`：「D-65: 作業者は作成・下書きの保存・破棄ができ、公開とアーカイブは 403」「D-65: 承認者は自分が保存した下書きを公開できる（201 相当の成功、`procedure.published` のログ）」「D-64: 管理者は手順書を作成して公開できる」「閲覧者は作成が 403」。
  - `read.test.ts`：未公開の手順書は閲覧者に `NOT_FOUND`、作業者・承認者には `unpublished` で返る。`GET …/draft` は閲覧者 403・作業者 200。下書きの最終更新者は閲覧者には返らない。
  - `start.test.ts`：閲覧者は 403、承認者と管理者は開始できる。
  - `approvals.test.ts`：承認者が自分で開始・終了した実行の承認・差し戻しは 403（Review Focus 1）。管理者は他の人の実行を承認できる。再依頼は閲覧者に下げられた本人だと 403。
  - `record.test.ts`：作業者を閲覧者に下げた後のステップの状態の変更は 403（Review Focus 2）。
  - `end.test.ts`：
    - 作業者を閲覧者に下げると、本人の終了は 403、管理者の中止（理由あり）は成功し、管理者が読む詳細の `adminCanCancel` が真（Review Focus 2）。
    - 実行者の `user_roles` の行を消すと、管理者が中止できる（Review Focus 4）。
    - 管理者が自分で開始した実行を理由なしで中止すると成功し、ログが `by: "executor"`（Review Focus 3）。
    - 実行者が作業者のままなら、管理者の中止は 403。
  - `home.test.ts`：作業者は `myExecutions`・`drafts` のキーだけ、承認者と管理者は3つ、閲覧者はキーなし。

- [ ] **Step 3: 失敗を確かめる** — Run: `pnpm vitest run --project server` / Expected: 足したテストと、`roles` を使うコードのテストが FAIL

- [ ] **Step 4: 実装する**
  - `procedures/routes.ts`：下書きの GET・作成・保存・破棄は `requirePermission("editProcedure")`、公開は `"publishProcedure"`、アーカイブは `"archiveProcedure"`。`read-service.ts` の `isAuthor` は `canEditDrafts = (actor) => can(actor.role, "editProcedure")` に。
  - `executions/routes.ts`：`requireRole("executor")` と中止の `requireRole("executor", "admin")` をすべて `requirePermission("execute")` に（管理者は作業者以上なので中止のルートも通る）。`start-service.ts` の未公開の判定は `can(actor.role, "editProcedure")`。
  - `queries.ts`：`assertOwner` は `can(actor.role, "execute")`。`executorBlocked` は Interfaces のとおり。
  - `end-service.ts`：本人で `can(actor.role, "execute")` なら実行者として、そうでなく `can(actor.role, "cancelAsAdmin")` で `executorBlocked` なら管理者として、どちらでもなければ今と同じエラー。`read-service.ts` の `adminCanCancel` を返す条件は `can(actor.role, "cancelAsAdmin")`。
  - `approvals/routes.ts`：承認・差し戻しは `"approve"`、再依頼は `"execute"`。`service.ts` のコメントを直す。
  - `home-service.ts`：`execute`→`myExecutions`、`approve`→`pendingApprovals`、`editProcedure`→`drafts`。
  - コメントの「作成者ロール」「実行者ロール」「承認者ロール」は「作業者以上」「承認者以上」に直す。

- [ ] **Step 5: 通ることを確かめる** — Run: `pnpm vitest run --project server` と `pnpm --filter @tadori/server typecheck && pnpm --filter @tadori/shared typecheck`/ Expected: PASS

- [ ] **Step 6: コミット** — `git commit -m "server: 手順書・実行・承認・ホームの認可を対応表で判定し、公開とアーカイブを承認者以上にする（D-65）"`

---

### Task 4: 画面のロールの判定と、作業者の編集画面

**Files:**
- Modify: `web/src/lib/roles.ts`、`web/src/lib/nav.ts`、`web/src/components/app-shell.tsx`、`web/src/routes/_app/admin.tsx`、`web/src/routes/_app/procedures/index.tsx`、`web/src/features/procedures/{procedure-list,procedure-detail}.tsx`、`web/src/features/procedures/editor/{editor-page,procedure-editor}.tsx`、`web/src/features/executions/{start-form,execution-page,execution-dialogs,approval-action}.tsx|ts`、`web/src/features/me/home-page.tsx`
- Test: `web/src/features/executions/approval-action.test.ts`、`web/src/lib/nav.test.ts`

**Interfaces:**
- Consumes: Task 1 の `can`・`Role`・`ROLES`、`MeResponse.role`
- Produces:
  - `ROLE_LABELS: Record<Role, string>`、`ROLE_DESCRIPTIONS: Record<Role, string>`（Global Constraints のコピー）、`ROLE_ICONS`（admin `Shield`・approver `BadgeCheck`・worker `PencilLine`・viewer `Eye`）を `web/src/lib/roles.ts` に
  - `visibleNavItems(role: Role)`（管理は `can(role, "manageUsers")`）
  - `approvalAction(detail, me: Pick<MeResponse, "id" | "role">)`（判定は `can(me.role, "approve")`・`can(me.role, "execute")`）

- [ ] **Step 1: 失敗するテストを書く**：`approval-action.test.ts` を `role` で書き直し、「承認者は自分の差し戻された実行に再依頼を出す（承認は出さない）」「管理者は他の人の承認待ちに承認を出す」「閲覧者には何も出さない」を足す。`nav.test.ts` は `visibleNavItems(role)` で「承認者には管理を出さない・管理者には出す」。

- [ ] **Step 2: 失敗を確かめる** — Run: `pnpm vitest run --project web` / Expected: FAIL

- [ ] **Step 3: 実装する**（`me.roles.includes(...)` をすべて `can(me.role, ...)` に置き換える）
  - ヘッダのユーザーメニューは `ROLE_LABELS[me.role]` を1つ出す（「ロールなし」は消す）。`admin.tsx` は `can(me.role, "manageUsers")`。
  - 手順書：作成・編集・未公開のカードは `editProcedure`、アーカイブは `archiveProcedure`、実行を開始は `execute`。コメントの「作成者」は「作業者以上」に。
  - 編集画面（S-08・S-09 とも）：`can(me.role, "publishProcedure")` でなければ「公開する」を出さず、「保存」を主なボタン（`variant` 既定）にし、見出しの帯の下に案内（Global Constraints のコピー、`text-muted-foreground` の1行）を出す。権限のない画面の説明は「作業者以上のロールが必要です」。
  - S-10・S-12：本人の判定は `can(me.role, "execute")`。管理者の中止の理由の文言を「ロールが閲覧者である」に。
  - ホーム：区画の `role` を `permission: Permission`（`execute`・`approve`・`editProcedure`）にし、骨組みは `can(me.role, …)` で数える。

- [ ] **Step 4: 通ることを確かめる** — Run: `pnpm vitest run --project web` / Expected: PASS（`features/users` の型エラーは Task 5 で直す）

- [ ] **Step 5: 作業者の編集画面を見て確かめる**：一時的な Playwright のスペック（コミットしない）で、作業者でログインして S-09 を開き、「公開する」がなく案内が出ること、承認者では「公開する」が出ることを `page.screenshot` で撮り、Read で見る（ライト・ダーク）。

- [ ] **Step 6: コミット** — `git commit -m "web: ロールの判定を対応表に揃え、作業者の編集画面では公開を出さず案内する（D-65）"`

---

### Task 5: ユーザー管理の画面（S-13〜S-15）をロール1つの選択にする

**Files:**
- Create: `web/src/components/ui/radio-group.tsx`（`yes N | pnpm exec shadcn add radio-group`）、`web/src/features/users/role-radio.tsx`
- Modify: `web/src/features/users/{queries,user-create-form,user-detail,user-list}.tsx|ts`、`web/src/features/users/filter.test.ts`（フィクスチャの `role`）
- Delete: `web/src/features/users/role-switches.tsx`

**Interfaces:**
- Consumes: Task 1 の `ROLES`・`Role`・`SetRoleRequest`、Task 4 の `ROLE_LABELS`・`ROLE_DESCRIPTIONS`・`ROLE_ICONS`
- Produces:
  - `RoleRadio({ value, onChange, disabled, disabledReason, invalid, name }: { value: Role | undefined; onChange: (role: Role) => void; disabled?: boolean; disabledReason?: string; invalid?: boolean; name: string })`：Base UI の RadioGroup で `ROLES` の順に縦に並べ、各行にアイコン・ロール名・説明。上に一文（Global Constraints）。各ラジオのアクセシブルな名前はロール名で始める（E2E で `getByRole("radio", { name: /^作業者/ })` で探す）
  - `useSetRole(userId: string)`：`api.admin.users[":id"].role.$put({ param: { id }, json: { role } })`、`onSettled` で一覧と詳細を取り直す

- [ ] **Step 1: 部品を足し、S-14 を作り替える**：`radio-group` を shadcn から足し、`components/ui/radio-group.tsx` の実装（Base UI の引数）を読んでから `RoleRadio` を書く。S-14 のフォームは `role` を `Controller` で `RoleRadio` につなぎ、`defaultValues` に `role` を入れない（未選択）。`FIELDS` の `roles` を `role` に。

- [ ] **Step 2: S-15 を作り替える**：`RoleSwitches` の区画を `RoleRadio` の区画に置き換える（見出し「ロール」、補足「選ぶとすぐに反映します」、`ErrorBanner`）。自分自身は `disabled` と理由「自分のロールは変更できません」。閲覧者を選んだとき、今のロールが閲覧者でなく `runningExecutions.length > 0` なら確認ダイアログ（Global Constraints のコピー、今の `role-switches.tsx` のダイアログの見た目のまま）を出し、「閲覧者にする」で送る。送信中は選択肢を押せなくし、選んだ値を先に表示する（今のスイッチと同じ考え方）。

- [ ] **Step 3: 一覧（S-13）**：ロールの列はバッジ1つ（`ROLE_LABELS[user.role]`）。

- [ ] **Step 4: 確かめる** — Run: `pnpm typecheck && pnpm vitest run --project web && pnpm lint` / Expected: PASS（ここで型エラーがなくなる）。一時的な Playwright のスペックで S-14（未選択で作成を押したエラー）と S-15（自分自身・他人）を撮って Read で見る（ライト・ダーク）。

- [ ] **Step 5: コミット** — `git commit -m "web: ユーザーの作成と詳細でロールを4つの選択肢から1つ選ぶ（D-64）"`

---

### Task 6: E2E を4段階のロールに合わせる

**Files:**
- Modify: `web/e2e/helpers.ts`、`web/e2e/{users,procedures,approvals,home,executions}.spec.ts`

**Interfaces:**
- Consumes: Task 2 の API（作成の `role`、`PUT /api/admin/users/{id}/role`）、Task 4・5 の画面のコピー

- [ ] **Step 1: ユーザーの作り方を直す**：`setupAuthor` は `role: "approver"`（手順書の E2E は公開・アーカイブもするため。名前の author1・author2 はそのまま）。`approvals.spec.ts` は runner を `worker`・checker を `approver` にし、管理者に承認者ロールを一時的に付ける・外す処理を消す（管理者は承認者以上）。`home.spec.ts` は runner を `worker`・checker を `approver` にし、checker のホームの期待を3区画に直す。`executions.spec.ts` の runner1 は `worker`。

- [ ] **Step 2: users.spec.ts を直す**
  - 作成のテスト：`getByRole("radio", { name: /^作業者/ })` を選んで作成 → 詳細で同じラジオが選ばれている。
  - 未選択で「作成する」を押すと「ロールを選んでください。」が出る（新しいユーザーは作らない）。
  - 「ロールのスイッチで付与と剥奪」のテストは、作ったユーザーのロールを承認者に変えると選ばれ、再読み込みしても残る、に置き換える。
  - 「自分に作成者ロールを付ける」のテストは消し、「自分の詳細ではロールの選択肢を押せず、『自分のロールは変更できません』を出し、⋯ を出さない」に。ヘッダのメニューに「管理者」が出ることもここで確かめる。

- [ ] **Step 3: procedures.spec.ts に D-34・D-65 を足す**（新しいユーザーは作らない。author2 のロールを管理者の API で一時的に変え、`try/finally` で `approver` に戻す）
  - D-34：author2 を `viewer` にして、一覧に「未公開」のカードがなく、`?status=unpublished` で「すべて」が押された状態。（今の「管理者ロールだけの人には3枚」は、管理者が作業者以上になったので、この閲覧者の確かめ方に置き換える）
  - D-65：author2 を `worker` にして、公開済みの手順書の編集画面に「公開する」がなく案内が出て「保存」で保存できる。詳細の「その他の操作」に「アーカイブ」がない。

- [ ] **Step 4: 閲覧者に下げる確認ダイアログ**：実行中の実行がある実行者（`executions.spec.ts` の runner1 など、すでに実行中の実行を持つ人）の S-15 で「閲覧者」を選ぶと、件数つきの確認が出て、キャンセルすると「作業者」のまま。

- [ ] **Step 5: 確かめる** — Run: `pnpm e2e` / Expected: すべて PASS

- [ ] **Step 6: コミット** — `git commit -m "e2e: 4段階のロールに合わせ、作業者の公開・閲覧者の未公開・ロールの選択を確かめる"`

---

### Task 7: CLAUDE.md の更新、全体の確認、レビュー

**Files:**
- Modify: `CLAUDE.md`（tadori）

- [ ] **Step 1: CLAUDE.md を直す**：「崩してはいけない不変条件」の認可（4段階・1人1つ・上は下を含む・対応表は `shared/src/schemas/roles.ts` の `PERMISSIONS`・本人は作業者以上）、応答に含めてよい情報（下書き・未公開は作業者以上）、構成の `middleware/role.ts`（`requirePermission`）と `web/src/lib/roles.ts`（表示名と説明）、E2E の注意（`approvals.spec.ts` の管理者へのロールの付け外しは消えた、`procedures.spec.ts` は author2 のロールを一時的に変える）。

- [ ] **Step 2: 全体を流す** — Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`、続けて `pnpm e2e` / Expected: すべて PASS。`grep -rn -E '"(author|executor)"|roles\.includes|requireRole' server/src shared/src web/src web/e2e` が実行の `by: "executor"`・`mode: "executor"` 以外に当たらない。

- [ ] **Step 3: コミット** — `git commit -m "CLAUDE.md を4段階のロールに合わせる"`

- [ ] **Step 4: Opus のエージェントでブランチ全体をレビューし、Critical/Important を直す**（いつもの流れ）。その後 push → PR → CI → ユーザーの合図でマージ。tadori-docs の conventions.md のコミットの push もユーザーに確認する。
