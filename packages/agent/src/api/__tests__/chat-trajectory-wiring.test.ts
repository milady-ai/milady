/**
 * Verifies that the /api/chat handler delegates trajectory creation to
 * @elizaos/plugin-trajectory-logger's MESSAGE_RECEIVED event handler,
 * which sets trajectoryStepId on the message metadata before handleMessage.
 *
 * The server.ts code must NOT create its own trajectory (which would
 * conflict with the plugin's step ID).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
	path.resolve(import.meta.dirname, "..", "server.ts"),
	"utf-8",
);

describe("chat trajectory wiring", () => {
	it("emits MESSAGE_RECEIVED before handleMessage", () => {
		const emitIdx = serverSource.indexOf(
			'emitEvent("MESSAGE_RECEIVED"',
		);
		const handleIdx = serverSource.indexOf(
			"runtime.messageService?.handleMessage",
		);
		expect(emitIdx).toBeGreaterThan(-1);
		expect(handleIdx).toBeGreaterThan(-1);
		expect(emitIdx).toBeLessThan(handleIdx);
	});

	it("does NOT manually start a trajectory (delegates to plugin)", () => {
		// The server should NOT call startTrajectory directly — that creates
		// a duplicate trajectory that conflicts with the plugin's step ID.
		expect(serverSource).not.toContain("trajLogger.startTrajectory");
	});

	it("documents that trajectory creation is handled by the plugin", () => {
		expect(serverSource).toContain(
			"Trajectory creation is handled by @elizaos/plugin-trajectory-logger",
		);
	});
});
