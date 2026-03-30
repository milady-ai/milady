import { t as translate, type TranslationVars } from "../../packages/app-core/src/i18n";

export function testT(key: string, vars?: TranslationVars): string {
  return translate("en", key, vars);
}
