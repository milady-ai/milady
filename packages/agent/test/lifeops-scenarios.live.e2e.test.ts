import { afterAll, beforeAll, expect, it } from "vitest";
import { describeIf } from "../../../test/helpers/conditional-tests.ts";
import type { StartedLifeOpsLiveRuntime } from "./helpers/lifeops-live-harness.ts";
import {
  LIVE_CHAT_TESTS_ENABLED,
  LIVE_SCENARIO_TESTS_ENABLED,
  LIVE_TESTS_ENABLED,
  getLifeOpsLiveSetupWarnings,
  selectLifeOpsLiveProvider,
  startLifeOpsLiveRuntime,
} from "./helpers/lifeops-live-harness.ts";
import {
  loadLifeOpsScenarioCatalog,
  runLifeOpsLiveScenario,
} from "./helpers/lifeops-live-scenario-runner.ts";

const selectedLiveProvider = await selectLifeOpsLiveProvider();
const LIVE_SCENARIO_SUITE_ENABLED =
  LIVE_TESTS_ENABLED &&
  LIVE_CHAT_TESTS_ENABLED &&
  LIVE_SCENARIO_TESTS_ENABLED &&
  selectedLiveProvider !== null;

if (!LIVE_SCENARIO_SUITE_ENABLED) {
  console.info(
    `[lifeops-scenarios-live] suite skipped until setup is complete: ${getLifeOpsLiveSetupWarnings(selectedLiveProvider).join(" | ")}${!LIVE_SCENARIO_TESTS_ENABLED ? " | set MILADY_LIVE_SCENARIO_TEST=1" : ""}`,
  );
}

const scenarios = await loadLifeOpsScenarioCatalog();

describeIf(LIVE_SCENARIO_SUITE_ENABLED)(
  "Live: LifeOps PRD scenario matrix",
  () => {
    let runtime: StartedLifeOpsLiveRuntime | undefined;

    beforeAll(async () => {
      runtime = await startLifeOpsLiveRuntime({
        selectedProvider: selectedLiveProvider,
      });
    }, 240_000);

    afterAll(async () => {
      if (runtime) {
        await runtime.close();
      }
    });

    for (const scenario of scenarios) {
      it(
        `${scenario.id}: ${scenario.title}`,
        async () => {
          if (!runtime) {
            throw new Error("Live runtime was not started.");
          }
          const report = await runLifeOpsLiveScenario({
            runtime,
            scenario,
          });
          expect(report.status, report.error).toBe("passed");
          expect(report.turns.length).toBe(scenario.turns.length);
          expect(
            report.finalChecks.every((check) => check.status === "passed"),
          ).toBe(true);
        },
        300_000,
      );
    }
  },
);
