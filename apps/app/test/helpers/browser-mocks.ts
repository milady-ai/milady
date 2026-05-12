const CONSOLE_PATCH_MARK = Symbol.for("milady.test.consoleErrorPatched");

export function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
  } as Storage;
}

export function hasStorageApi(value: unknown): value is Storage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Storage).getItem === "function" &&
      typeof (value as Storage).setItem === "function" &&
      typeof (value as Storage).removeItem === "function" &&
      typeof (value as Storage).clear === "function",
  );
}

export function suppressReactTestConsoleErrors(): void {
  const consoleObject = console as Console & { [CONSOLE_PATCH_MARK]?: boolean };
  if (consoleObject[CONSOLE_PATCH_MARK]) return;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      (/not wrapped in act/.test(first) ||
        /ReactDOMTestUtils.act is deprecated/.test(first))
    ) {
      return;
    }
    originalError(...args);
  };
  consoleObject[CONSOLE_PATCH_MARK] = true;
}
