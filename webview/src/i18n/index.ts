/**
 * Tiny i18n layer for the BranchBoard webview.
 *
 * - Default language is Polish ("pl").
 * - Keys are dot-paths into the JSON dictionaries (e.g. "task.add").
 * - Missing keys fall back: selected language -> Polish -> the raw key.
 * - Supports {param} interpolation: t("task.assignedTo", { name: "Darek" }).
 *
 * The dictionaries are plain JSON so adding a new language is just a new file
 * plus an entry in `dictionaries` below.
 */
import pl from "./pl.json";
import en from "./en.json";

export type Language = "pl" | "en";

type Dict = Record<string, unknown>;

const dictionaries: Record<Language, Dict> = { pl, en };

export const AVAILABLE_LANGUAGES: Language[] = ["pl", "en"];
export const DEFAULT_LANGUAGE: Language = "pl";

let current: Language = DEFAULT_LANGUAGE;

export function setLanguage(lang: Language): void {
  current = dictionaries[lang] ? lang : DEFAULT_LANGUAGE;
}

export function getLanguage(): Language {
  return current;
}

export function normalizeLanguage(value: unknown): Language {
  return value === "en" || value === "pl" ? value : DEFAULT_LANGUAGE;
}

/** Resolve a dot-path key inside a dictionary, returning undefined if absent. */
function resolve(dict: Dict, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = dict;
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Dict)) {
      node = (node as Dict)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Translate a key. Falls back to Polish, then to the key itself, and never
 * throws — a missing key just renders its own name so the app keeps working.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const fromCurrent = resolve(dictionaries[current], key);
  if (fromCurrent !== undefined) {
    return interpolate(fromCurrent, params);
  }
  const fromDefault = resolve(dictionaries[DEFAULT_LANGUAGE], key);
  if (fromDefault !== undefined) {
    return interpolate(fromDefault, params);
  }
  return key;
}
