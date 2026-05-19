import { useEffect } from "react";
import { useT } from "../providers/I18nProvider";

/**
 * Keeps `<title>` and the Open Graph / Twitter meta tags in sync with the
 * active i18n language. The static markup in `index.html` provides the
 * pre-React fallback values; once React mounts this component swaps them in
 * for the translated strings on every language change.
 */
export function DocumentMetaManager(): null {
  const t = useT();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const title = t("homepage.meta.title", {
      defaultValue: "Milady | Local-First Control",
    });
    const description = t("homepage.meta.description", {
      defaultValue:
        "Milady is a local-first frontend for opening local runtimes, signing into Eliza Cloud, and controlling existing remote instances.",
    });
    const ogTitle = t("homepage.meta.ogTitle", {
      defaultValue: "Milady",
    });
    const ogDescription = t("homepage.meta.ogDescription", {
      defaultValue:
        "Open Milady locally, sign into Eliza Cloud, or control an existing remote runtime.",
    });

    document.title = title;

    const setMeta = (selector: string, value: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(selector);
      if (el) el.content = value;
    };

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', ogTitle);
    setMeta('meta[property="og:description"]', ogDescription);
    setMeta('meta[name="twitter:title"]', ogTitle);
    setMeta('meta[name="twitter:description"]', ogDescription);
  }, [t]);

  return null;
}
