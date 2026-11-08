import "@tanstack/react-router";

// 画面の移動に添える情報（URL には出さない）。
declare module "@tanstack/react-router" {
  interface HistoryState {
    /** S-08 で作成した後に公開できなかったとき、S-09 の上に出す知らせ。 */
    editorNotice?: string;
    /** S-17 の「公開する」で公開時の検証に通らなかったとき、S-09 を開いてすぐにエラーの場所を示す。 */
    editorPublishCheck?: boolean;
  }
}
