import { describe, expect, it } from "vitest";
import { ensureMiladyNamespaceDefaults } from "./namespace-defaults";

describe("ensureMiladyNamespaceDefaults", () => {
  it("defaults both namespaces to milady when absent", () => {
    const env = {} as NodeJS.ProcessEnv;

    ensureMiladyNamespaceDefaults(env);

    expect(env.MILADY_NAMESPACE).toBe("milady");
    expect(env.ELIZA_NAMESPACE).toBe("milady");
  });

  it("mirrors MILADY_NAMESPACE into ELIZA_NAMESPACE when only brand env is set", () => {
    const env = { MILADY_NAMESPACE: "milady-dev" } as NodeJS.ProcessEnv;

    ensureMiladyNamespaceDefaults(env);

    expect(env.MILADY_NAMESPACE).toBe("milady-dev");
    expect(env.ELIZA_NAMESPACE).toBe("milady-dev");
  });

  it("preserves an explicit ELIZA_NAMESPACE and mirrors it back to MILADY_NAMESPACE", () => {
    const env = { ELIZA_NAMESPACE: "custom" } as NodeJS.ProcessEnv;

    ensureMiladyNamespaceDefaults(env);

    expect(env.ELIZA_NAMESPACE).toBe("custom");
    expect(env.MILADY_NAMESPACE).toBe("custom");
  });
});
