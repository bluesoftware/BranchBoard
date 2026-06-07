/**
 * Extension-host i18n. Mirrors the webview helper but for VS Code-side
 * notifications. The active language is read from the `branchBoard.language`
 * setting (default Polish) via setLanguage().
 */
import { pl, ExtMessages } from "./pl";
import { en } from "./en";

export type Language = "pl" | "en";

const dictionaries: Record<Language, ExtMessages> = { pl, en };

let current: Language = "pl";

export function setLanguage(value: unknown): void {
  current = value === "en" ? "en" : "pl";
}

export function getLanguage(): Language {
  return current;
}

/**
 * Translate an extension-side message key, interpolating {param} tokens.
 * Falls back to Polish, then to the key name, and never throws.
 */
export function t(key: keyof ExtMessages, params?: Record<string, string | number>): string {
  const template = dictionaries[current][key] ?? dictionaries.pl[key] ?? String(key);
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}
