import results from "../catalog/result-strings.json";
import strings from "./ui-strings.json";

export type Language = "en" | "de";

let language: Language =
  localStorage.getItem("roots-local-language") === "de" ? "de" : "en";

export function getLanguage() {
  return language;
}

export function setLanguage(value: Language) {
  language = value;
  document.documentElement.lang = value;
  localStorage.setItem("roots-local-language", value);
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
