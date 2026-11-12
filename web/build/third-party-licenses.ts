// ブラウザに配る JS に含まれるライブラリのライセンス一覧の書き方（D-69）。
// 集めるのは rollup-plugin-license（vite.config.ts）。バンドルに入ったパッケージだけが渡される。
// このファイルはログインしなくても読めるので、版は書かない（全部のライブラリの版を並べて見せない。
// 配る JS・CSS 自体にも一部の版は含まれるので、完全に隠せるわけではない）。

/** rollup-plugin-license の Dependency のうち、使う所だけ */
export type LicensedDependency = {
  readonly name: string | null;
  readonly license: string | null;
  readonly licenseText: string | null;
};

const RULE = "=".repeat(64);

export function formatLicenses(deps: readonly LicensedDependency[]): string {
  const seen = new Set<string>();
  const entries: { name: string; license: string; text: string }[] = [];
  for (const d of deps) {
    if (!d.name || d.name.startsWith("@tadori/")) continue;
    const text = d.licenseText?.trim() || "LICENSE のファイルがありません";
    const key = `${d.name}\0${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name: d.name, license: d.license || "UNKNOWN", text });
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const body = entries.map((e) => `${RULE}\n${e.name} (${e.license})\n${RULE}\n${e.text}\n`);
  return [
    "Tadori に含まれるライブラリのライセンス",
    "（ブラウザに配る JS に含まれるもの）",
    "",
    ...body,
  ].join("\n");
}
