import "@tanstack/react-router";

// 画面の移動に添える情報（URL には出さない）。
declare module "@tanstack/react-router" {
  interface HistoryState {
    /** S-08 で作成した後に公開できなかったとき、S-09 の上に出す知らせ。 */
    editorNotice?: string;
  }
}
