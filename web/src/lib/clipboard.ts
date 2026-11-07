// クリップボードへのコピー。navigator.clipboard は安全な接続（HTTPS か localhost）でしか使えないが、
// Tadori は閉じたネットワークで HTTP のまま動かすことがある（HTTPS はアプリで扱わない）ので、
// そのときは選択した文字を execCommand でコピーする。どちらもできなければ失敗を返す。
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  area.focus();
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("コピーできませんでした。");
  } finally {
    area.remove();
    active?.focus();
  }
}
