import results from "../catalog/result-strings.json";
import strings from "./ui-strings.json";

export type Language = "en" | "de";

// The language is the only thing Roots Local remembers in the browser.
function stored(): string | null {
  try {
    return localStorage.getItem("roots-local-language");
  } catch {
    return null;
  }
}
// Without a stored choice, follow the browser: German for any de-* language
// ranked first among the languages Roots Local offers, otherwise English.
function preferred(): Language {
  const value = stored();
  if (value === "de" || value === "en") return value;
  const languages = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  const first = languages.map((tag) => tag.toLowerCase()).find((tag) => /^(de|en)\b/.test(tag));
  return first?.startsWith("de") ? "de" : "en";
}
let language: Language = preferred();

export function getLanguage() {
  return language;
}

export function setLanguage(value: Language) {
  language = value;
  document.documentElement.lang = value;
  try {
    localStorage.setItem("roots-local-language", value);
  } catch {
    // Private browsing may refuse storage; the choice then lasts for this tab.
  }
}

export function t(message: keyof typeof strings): string {
  return language === "de" ? message : strings[message];
}

export function resultText(value: string): string {
  if (language === "de") return value;
  if (Object.hasOwn(results, value))
    return results[value as keyof typeof results];
  return value.startsWith("Publikation · ")
    ? value.replace("Publikation · ", "Publication · ")
    : value;
}
