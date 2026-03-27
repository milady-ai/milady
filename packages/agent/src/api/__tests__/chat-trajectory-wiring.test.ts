import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
	path.resolve(import.meta.dirname, "..", "server.ts"),
	"utf-8",
);

const persistSource = readFileSync(
	path.resolve(
		import.meta.dirname,
		"..",
		"..",
		"runtime",
		"trajectory-persistence.ts",
	),
	"utf-8",
);

describe("chat trajectory wiring", () => {
	it("emits MESSAGE_RECEIVED before handleMessage", () => {
		const emitIdx = serverSource.indexOf('emitEvent("MESSAGE_RECEIVED"');
		const handleIdx = serverSource.indexOf(
			"runtime.messageService?.handleMessage",
		);
		expect(emitIdx).toBeGreaterThan(-1);
		expect(handleIdx).toBeGreaterThan(-1);
		expect(emitIdx).toBeLessThan(handleIdx);
	});

	it("does NOT manually start a trajectory (delegates to plugin)", () => {
		expect(serverSource).not.toContain("trajLogger.startTrajectory");
	});
});

describe("startStep returns trajectory ID (regression)", () => {
	it("DatabaseTrajectoryLogger.startStep returns trajectoryId", () => {
		const classMatch = persistSource.match(
			/startStep\(trajectoryId:\s*string\):\s*string\s*\{[^}]*return\s+trajectoryId/,
		);
		expect(classMatch).toBeTruthy();
	});

	it("no startStep generates step-xxx IDs", () => {
		expect(persistSource).not.toMatch(
			/startStep[^}]*step-\$\{Date\.now\(\)\}/,
		);
	});
});
