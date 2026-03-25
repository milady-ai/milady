import { useEffect, useState } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function readDocumentTheme(): NonNullable<ToasterProps["theme"]> {
  if (typeof document === "undefined") return "dark";
  const root = document.documentElement;
  return root.dataset.theme === "light" || !root.classList.contains("dark")
    ? "light"
    : "dark";
}

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] =
    useState<NonNullable<ToasterProps["theme"]>>(readDocumentTheme);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const syncTheme = () => setTheme(readDocumentTheme());
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-bg group-[.toaster]:text-txt group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-fg",
          cancelButton: "group-[.toast]:bg-bg-accent group-[.toast]:text-muted",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
