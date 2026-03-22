import { useEffect } from "react";

export function getNextTabForStreamPopoutEvent<TTab extends string>(
  _detail: unknown,
): TTab | null {
  return null;
}

export function useStreamPopoutNavigation<TTab extends string>(
  setTab: (tab: TTab) => void,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const nextTab = getNextTabForStreamPopoutEvent<TTab>(
        (event as CustomEvent).detail,
      );
      if (nextTab) {
        setTab(nextTab);
      }
    };

    window.addEventListener("stream-popout", handler);
    return () => window.removeEventListener("stream-popout", handler);
  }, [setTab]);
}
