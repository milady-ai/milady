import fs from "node:fs";
import path from "node:path";
import {
  createTranslator,
  MESSAGES,
  normalizeLanguage,
  t,
  UI_LANGUAGES,
} from "@miladyai/app-core/i18n";
import { describe, expect, it } from "vitest";

describe("i18n helpers", () => {
  it("normalizes supported language tags", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("en-US")).toBe("en");
  });

  it("falls back to english for unknown language input", () => {
    expect(normalizeLanguage("xx")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });

  it("normalizes Tagalog aliases and serves Tagalog translations", () => {
    expect(UI_LANGUAGES).toContain("tl");
    expect(normalizeLanguage("tl")).toBe("tl");
    expect(normalizeLanguage("tl-PH")).toBe("tl");
    expect(normalizeLanguage("tl-US")).toBe("tl");
    expect(normalizeLanguage("fil")).toBe("tl");
    expect(normalizeLanguage("fil-PH")).toBe("tl");
    expect(normalizeLanguage("fil-CA")).toBe("tl");
    expect(t("tl", "settings.language")).toBe("Wika");
    expect(createTranslator("tl")("chat.inputPlaceholder")).toBe(
      "Mag-type ng mensahe...",
    );
  });

  it("falls back to english message when key is missing in selected locale", () => {
    expect(t("zh-CN", "nav.chat")).toBe("聊天");
    expect(t("zh-CN", "nonexistent.key")).toBe("nonexistent.key");
  });

  it("uses defaultValue when a translation key is missing everywhere", () => {
    expect(
      t("pt", "settings.missingExample", { defaultValue: "Fallback copy" }),
    ).toBe("Fallback copy");
  });

  it("interpolates template variables via defaultValue", () => {
    // No production messages currently use {{var}} templates, but the
    // interpolation path is still exercised through defaultValue.
    expect(
      t("en", "nonexistent.interpolation", {
        defaultValue: "Expires in {{seconds}}s",
        seconds: 12,
      }),
    ).toContain("12");
    expect(
      t("zh-CN", "nonexistent.interpolation", {
        defaultValue: "{{count}} minutes ago",
        count: 8,
      }),
    ).toContain("8");
  });

  it("creates stable translator for a target language", () => {
    const zh = createTranslator("zh-CN");
    expect(zh("nav.wallets")).toBe("钱包");
  });

  it("keeps the image processing upload label short in every locale", () => {
    expect(MESSAGES.en["knowledgeview.IncludeAIImageDes"]).toBe(
      "Process Images",
    );
    expect(MESSAGES.es["knowledgeview.IncludeAIImageDes"]).toBe(
      "Procesar imágenes",
    );
    expect(MESSAGES.ko["knowledgeview.IncludeAIImageDes"]).toBe("이미지 처리");
    expect(MESSAGES.pt["knowledgeview.IncludeAIImageDes"]).toBe(
      "Processar imagens",
    );
    expect(MESSAGES["zh-CN"]["knowledgeview.IncludeAIImageDes"]).toBe(
      "处理图片",
    );
  });

  it("keeps locale keys in sync across all supported locales", () => {
    const collectKeys = (obj: Record<string, string>): string[] => {
      return Object.keys(obj);
    };

    const enKeys = new Set(collectKeys(MESSAGES.en));
    for (const language of UI_LANGUAGES) {
      const localeKeys = new Set(collectKeys(MESSAGES[language]));
      const missingInEnglish: string[] = [];

      // Non-English locales may lag behind English — only flag keys that
      // appear in a locale but NOT in English (likely stale/orphaned keys).
      localeKeys.forEach((key) => {
        if (!enKeys.has(key)) {
          missingInEnglish.push(key);
        }
      });

      expect(missingInEnglish, `unexpected keys in ${language}`).toEqual([]);
    }
  });

  it("all locales have the same number of keys as en.json", () => {
    const enKeys = Object.keys(MESSAGES.en);
    for (const [lang, messages] of Object.entries(MESSAGES)) {
      if (lang === "en") continue;
      const localeKeys = Object.keys(messages as Record<string, string>);
      const missing = enKeys.filter((k) => !localeKeys.includes(k));
      expect(
        missing,
        `${lang} is missing keys: ${missing.join(", ")}`,
      ).toHaveLength(0);
    }
  });

  it("keeps production UI source files free of hardcoded Chinese text", () => {
    const candidates = [
      path.resolve(process.cwd(), "src"),
      path.resolve(process.cwd(), "apps", "app", "src"),
      path.resolve(__dirname, "..", "src"),
    ];
    const sourceDir =
      candidates.find((candidate) => fs.existsSync(candidate)) ??
      path.resolve(process.cwd(), "src");
    const exclusions = [
      path.join(sourceDir, "i18n", "messages.ts"),
      path.join(sourceDir, "onboarding-presets.ts"),
    ];

    const hasChinese = /[\u4e00-\u9fff]/;
    const filesWithChinese: string[] = [];

    const visit = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          if (item.name === "test" || item.name.startsWith(".")) {
            continue;
          }
          visit(itemPath);
          continue;
        }

        if (!item.isFile()) {
          continue;
        }

        if (!/\.(ts|tsx|js|jsx)$/.test(item.name)) {
          continue;
        }

        if (item.name.endsWith(".test.ts") || item.name.endsWith(".test.tsx")) {
          continue;
        }

        if (exclusions.includes(itemPath)) {
          continue;
        }

        const content = fs.readFileSync(itemPath, "utf8");
        if (hasChinese.test(content)) {
          const lines = content.split("\n");
          const lineIndex = lines.findIndex((line) => hasChinese.test(line));
          const snippet = lines[lineIndex]?.trim() ?? "";
          const relative = path.relative(process.cwd(), itemPath);
          filesWithChinese.push(`${relative}: L${lineIndex + 1}: ${snippet}`);
        }
      }
    };

    visit(sourceDir);

    expect(filesWithChinese).toEqual([]);
  });
});
