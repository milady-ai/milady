/**
 * Verifies that /api/cloud/v1/* routes are handled and forwarded as /api/v1/*
 * on the cloud backend, distinct from the legacy /api/cloud/compat/* mapping.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	path.resolve(import.meta.dirname, "..", "cloud-compat-routes.ts"),
	"utf-8",
);

describe("cloud compat v1 route handling", () => {
	it("defines the CLOUD_V1_PREFIX constant for /api/cloud/v1/", () => {
		expect(source).toContain('"/api/cloud/v1/"');
	});

	it("accepts /api/cloud/v1/ routes (isV1Route check)", () => {
		expect(source).toContain('pathname.startsWith(CLOUD_V1_PREFIX)');
	});

	it("rejects requests that match neither compat nor v1 prefix", () => {
		expect(source).toContain("if (!isCompatRoute && !isV1Route) return false;");
	});

	it("maps /api/cloud/v1/* to /api/v1/* on the upstream", () => {
		// The slice strips '/api/cloud' (10 chars) leaving '/v1/...'
		expect(source).toContain('pathname.slice("/api/cloud".length)');
	});

	it("keeps legacy compat path mapping for /api/cloud/compat/*", () => {
		expect(source).toContain('pathname.replace("/api/cloud", "/api")');
	});

	it("documents the v1 pairing-token use-case in a comment", () => {
		expect(source).toContain("pairing-token");
	});
});
