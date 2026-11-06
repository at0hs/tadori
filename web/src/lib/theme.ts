import { useCallback, useEffect, useState } from "react";

// 表示テーマ（D-62、ui.md 3章）。選んだ値はブラウザに保存する（秘密の情報ではない）。
// index.html の小さなスクリプトも同じ規則で <html> に dark を付ける。変えるときは両方を直す。

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "tadori.theme";

const PREFERENCES: readonly string[] = ["light", "dark", "system"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readThemePreference(storage: Pick<Storage, "getItem">): ThemePreference {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return value !== null && PREFERENCES.includes(value) ? (value as ThemePreference) : "system";
}

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): "light" | "dark" {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

function prefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function setHtmlClass(pref: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveTheme(pref, prefersDark()) === "dark");
}

/** 保存して、<html> の dark クラスを付け外しする。 */
export function applyTheme(pref: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, pref);
  setHtmlClass(pref);
}

/** 今のテーマの設定と、変える関数。OS に合わせるときは OS の切り替えに追従する。 */
export function useTheme(): {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
} {
  const [preference, setState] = useState(() => readThemePreference(localStorage));

  useEffect(() => {
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setHtmlClass("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    applyTheme(p);
    setState(p);
  }, []);

  return { preference, setPreference };
}
