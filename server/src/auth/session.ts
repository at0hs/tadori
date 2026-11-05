import { auth } from "./auth.ts";

/**
 * セッションを取る。期限を延ばしたときの Set-Cookie も返すので、呼び出し側で応答に移すこと。
 * 移さないと、操作を続けていてもブラウザの Cookie が切れる（D-14 の補足、library-checks.md SS-01）。
 */
export async function getSession(requestHeaders: Headers) {
  const { headers, response } = await auth.api.getSession({
    headers: requestHeaders,
    returnHeaders: true,
  });
  return { session: response, setCookies: headers.getSetCookie() };
}
