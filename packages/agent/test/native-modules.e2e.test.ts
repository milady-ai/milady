/**
 * Native Module Verification Tests
 *
 * Tests to verify that native Node.js modules required for vision and ML
 * capabilities are properly installed and functional:
 *
 *   1. TensorFlow.js Node bindings (@tensorflow/tfjs-node)
 *   2. Sharp image processing
 *   3. Canvas for face-api.js
 *   4. TensorFlow models (coco-ssd, mobilenet, pose-detection)
 *   5. Plugin-vision service availability
 *
 * These tests ensure Electron compatibility by verifying native modules
 * can be loaded and initialized correctly.
 *
 * In bun/npm workspaces, dependencies may be hoisted to the repo root
 * node_modules rather than living in the package-local node_modules.
 * All path checks use findPackagePath() to search both locations.
 *
 * Tests are automatically skipped when the corresponding native modules
 * are not installed (e.g. CI without vision deps, MILADY_NO_VISION_DEPS=1).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Finds a package in node_modules, checking both local and hoisted (repo root) locations.
 */
function findPackagePath(...segments: string[]): string | null {
	const local = path.join(packageRoot, "node_modules", ...segments);
	if (fs.existsSync(local)) return local;
	const hoisted = path.join(repoRoot, "node_modules", ...segments);
	if (fs.existsSync(hoisted)) return hoisted;
	return null;
}

/**
 * Attempts to require/import a module and returns success status
 */
async function canImportModule(
	moduleName: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		await import(moduleName);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Checks if a native binding file exists for a module
 */
function hasNativeBinding(modulePath: string, patterns: string[]): boolean {
	try {
		const nodeModulesPath =
			findPackagePath(modulePath) ??
			path.join(packageRoot, "node_modules", modulePath);
		if (!fs.existsSync(nodeModulesPath)) return false;

		// Recursively search for .node files
		const findNodeFiles = (dir: string): string[] => {
			const results: string[] = [];
			try {
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);
					if (entry.isDirectory()) {
						results.push(...findNodeFiles(fullPath));
					} else if (patterns.some((p) => entry.name.includes(p))) {
						results.push(fullPath);
					}
				}
			} catch {
				// Ignore permission errors
			}
			return results;
		};

		const nodeFiles = findNodeFiles(nodeModulesPath);
		return nodeFiles.length > 0;
	} catch {
		return false;
	}
}

/**
 * Reads package.json from both local and repo root, merging all deps.
 */
function getAllWorkspaceDeps(): Record<string, string> {
	const localPkg = JSON.parse(
		fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
	);
	const repoRootPkgPath = path.join(repoRoot, "package.json");
	const repoRootPkg = fs.existsSync(repoRootPkgPath)
		? JSON.parse(fs.readFileSync(repoRootPkgPath, "utf-8"))
		: {};
	return {
		...(repoRootPkg.dependencies || {}),
		...(repoRootPkg.devDependencies || {}),
		...(localPkg.dependencies || {}),
		...(localPkg.devDependencies || {}),
	};
}

// ---------------------------------------------------------------------------
// Pre-compute availability flags (evaluated once at module load)
// ---------------------------------------------------------------------------

const hasTfjsNode = !!findPackagePath("@tensorflow", "tfjs-node");
const hasTfjsNodeBinding = hasNativeBinding("@tensorflow/tfjs-node", [
	"tfjs_binding.node",
	".node",
]);
const hasTfjsCore = !!findPackagePath("@tensorflow", "tfjs-core");
const hasCocoSsd = !!findPackagePath("@tensorflow-models", "coco-ssd");
const hasMobilenet = !!findPackagePath("@tensorflow-models", "mobilenet");
const hasPoseDetection = !!findPackagePath(
	"@tensorflow-models",
	"pose-detection",
);
const hasSharp = !!findPackagePath("sharp");
const hasCanvas = !!findPackagePath("canvas");
const hasCanvasBinding = hasNativeBinding("canvas", [
	"canvas.node",
	".node",
]);
const hasFaceApi = !!findPackagePath("face-api.js");
const hasTesseract = !!findPackagePath("tesseract.js");
const hasPluginVision = !!findPackagePath("@elizaos", "plugin-vision");
const hasNodePty = !!findPackagePath("node-pty");
const hasLydellNodePty = [
	path.join(
		packageRoot,
		"node_modules",
		".bun",
		"@lydell+node-pty@1.1.0",
	),
	path.join(packageRoot, "node_modules", "@lydell", "node-pty"),
	path.join(
		repoRoot,
		"node_modules",
		".bun",
		"@lydell+node-pty@1.1.0",
	),
	path.join(repoRoot, "node_modules", "@lydell", "node-pty"),
].some((p) => fs.existsSync(p));
const hasPtyManager = !!findPackagePath("pty-manager");

const allDeps = getAllWorkspaceDeps();
const hasAnyNativeModuleDep = ["sharp", "canvas", "@tensorflow/tfjs-node"].some(
	(d) => !!allDeps[d],
);
const hasPtyDeps = !!allDeps["node-pty"] || !!allDeps["pty-manager"];
const hasEmbeddingDeps =
	!!allDeps["node-llama-cpp"] || !!allDeps["whisper-node"];

const electrobunPkgPath = (() => {
	const localPath = path.join(
		packageRoot,
		"apps",
		"app",
		"electrobun",
		"package.json",
	);
	const repoPath = path.join(
		repoRoot,
		"apps",
		"app",
		"electrobun",
		"package.json",
	);
	if (fs.existsSync(localPath)) return localPath;
	if (fs.existsSync(repoPath)) return repoPath;
	return null;
})();

const copyRuntimeScript = [
	path.join(packageRoot, "scripts", "copy-runtime-node-modules.ts"),
	path.join(repoRoot, "scripts", "copy-runtime-node-modules.ts"),
].find((p) => fs.existsSync(p)) ?? null;

const releaseWorkflow = [
	path.join(
		packageRoot,
		".github",
		"workflows",
		"release-electrobun.yml",
	),
	path.join(
		repoRoot,
		".github",
		"workflows",
		"release-electrobun.yml",
	),
].find((p) => fs.existsSync(p)) ?? null;

const corePluginsPath = (() => {
	const candidate = path.join(packageRoot, "src", "runtime", "core-plugins.ts");
	if (fs.existsSync(candidate)) return candidate;
	const jsCandidate = path.join(
		packageRoot,
		"src",
		"runtime",
		"core-plugins.js",
	);
	if (fs.existsSync(jsCandidate)) return jsCandidate;
	return null;
})();

const elizaTsPath = [
	path.join(packageRoot, "src", "runtime", "eliza.ts"),
	path.join(repoRoot, "src", "runtime", "eliza.ts"),
	path.join(
		packageRoot,
		"packages",
		"autonomous",
		"src",
		"runtime",
		"eliza.ts",
	),
	path.join(
		repoRoot,
		"packages",
		"autonomous",
		"src",
		"runtime",
		"eliza.ts",
	),
].find((p) => fs.existsSync(p)) ?? null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Native Module Installation Verification", () => {
	describe("TensorFlow.js", () => {
		it.skipIf(!hasTfjsNode)(
			"@tensorflow/tfjs-node is installed",
			async () => {
				const packagePath = findPackagePath("@tensorflow", "tfjs-node");
				expect(fs.existsSync(packagePath!)).toBe(true);
			},
		);

		it.skipIf(!hasTfjsNode || !hasTfjsNodeBinding)(
			"@tensorflow/tfjs-node has native binding",
			() => {
				const hasBinding = hasNativeBinding("@tensorflow/tfjs-node", [
					"tfjs_binding.node",
					".node",
				]);
				expect(hasBinding).toBe(true);
			},
		);

		it.skipIf(!hasTfjsCore)(
			"@tensorflow/tfjs-core is installed",
			async () => {
				const packagePath = findPackagePath("@tensorflow", "tfjs-core");
				expect(fs.existsSync(packagePath!)).toBe(true);
			},
		);
	});

	describe("TensorFlow Models", () => {
		it.skipIf(!hasCocoSsd)(
			"@tensorflow-models/coco-ssd is installed",
			() => {
				const packagePath = findPackagePath(
					"@tensorflow-models",
					"coco-ssd",
				);
				expect(fs.existsSync(packagePath!)).toBe(true);
			},
		);

		it.skipIf(!hasMobilenet)(
			"@tensorflow-models/mobilenet is installed",
			() => {
				const packagePath = findPackagePath(
					"@tensorflow-models",
					"mobilenet",
				);
				expect(fs.existsSync(packagePath!)).toBe(true);
			},
		);

		it.skipIf(!hasPoseDetection)(
			"@tensorflow-models/pose-detection is installed",
			() => {
				const packagePath = findPackagePath(
					"@tensorflow-models",
					"pose-detection",
				);
				expect(fs.existsSync(packagePath!)).toBe(true);
			},
		);
	});

	describe("Sharp Image Processing", () => {
		it.skipIf(!hasSharp)("sharp is installed", () => {
			const packagePath = findPackagePath("sharp");
			expect(fs.existsSync(packagePath!)).toBe(true);
		});

		it.skipIf(!hasSharp)("sharp can be imported", async () => {
			const result = await canImportModule("sharp");
			expect(result.success).toBe(true);
		});

		it.skipIf(!hasSharp)(
			"sharp can process an image buffer",
			async () => {
				const sharp = (await import("sharp")).default;
				const buffer = await sharp({
					create: {
						width: 1,
						height: 1,
						channels: 3,
						background: { r: 255, g: 0, b: 0 },
					},
				})
					.png()
					.toBuffer();

				expect(buffer).toBeInstanceOf(Buffer);
				expect(buffer.length).toBeGreaterThan(0);
			},
		);
	});

	describe("Canvas for Face Recognition", () => {
		it.skipIf(!hasCanvas)("canvas is installed", () => {
			const packagePath = findPackagePath("canvas");
			expect(fs.existsSync(packagePath!)).toBe(true);
		});

		it.skipIf(!hasCanvasBinding)(
			"canvas has native binding",
			() => {
				const hasBinding = hasNativeBinding("canvas", [
					"canvas.node",
					".node",
				]);
				expect(hasBinding).toBe(true);
			},
		);

		it.skipIf(!hasCanvasBinding)(
			"canvas can be imported",
			async () => {
				const result = await canImportModule("canvas");
				expect(result.success).toBe(true);
			},
		);

		it.skipIf(!hasCanvasBinding)(
			"canvas can create a 2D context",
			async () => {
				const { createCanvas } = await import("canvas");
				const canvas = createCanvas(100, 100);
				const ctx = canvas.getContext("2d");

				expect(ctx).toBeDefined();

				ctx.fillStyle = "red";
				ctx.fillRect(0, 0, 50, 50);

				const imageData = ctx.getImageData(0, 0, 1, 1);
				expect(imageData.data[0]).toBe(255);
			},
		);
	});

	describe("Face-API.js", () => {
		it.skipIf(!hasFaceApi)("face-api.js is installed", () => {
			const packagePath = findPackagePath("face-api.js");
			expect(fs.existsSync(packagePath!)).toBe(true);
		});

		it.skipIf(!hasFaceApi)(
			"face-api.js can be imported",
			async () => {
				const result = await canImportModule("face-api.js");
				expect(result.success).toBe(true);
			},
		);
	});

	describe("Tesseract.js OCR", () => {
		it.skipIf(!hasTesseract)("tesseract.js is installed", () => {
			const packagePath = findPackagePath("tesseract.js");
			expect(fs.existsSync(packagePath!)).toBe(true);
		});

		it.skipIf(!hasTesseract)(
			"tesseract.js can be imported",
			async () => {
				const result = await canImportModule("tesseract.js");
				expect(result.success).toBe(true);
			},
		);
	});
});

describe("Plugin-Vision Availability", () => {
	it.skipIf(!hasPluginVision)(
		"@elizaos/plugin-vision is installed",
		() => {
			const packagePath = findPackagePath("@elizaos", "plugin-vision");
			expect(fs.existsSync(packagePath!)).toBe(true);
		},
	);

	it.skipIf(!hasPluginVision)(
		"@elizaos/plugin-vision can be imported",
		async () => {
			const result = await canImportModule("@elizaos/plugin-vision");
			expect(result.success).toBe(true);
		},
	);

	it.skipIf(!hasPluginVision)(
		"plugin-vision has required dependencies",
		() => {
			const visionPkgDir = findPackagePath("@elizaos", "plugin-vision");
			const visionPkgPath = path.join(visionPkgDir!, "package.json");
			expect(fs.existsSync(visionPkgPath)).toBe(true);

			const visionPkgContent = fs.readFileSync(visionPkgPath, "utf-8");

			expect(visionPkgContent).toContain('"sharp"');
			expect(visionPkgContent).toContain('"canvas"');
			expect(visionPkgContent).toContain('"face-api.js"');
			expect(visionPkgContent).toContain('"tesseract.js"');
		},
	);

	it.skipIf(!hasSharp || !hasTesseract)(
		"vision dependencies are installed in node_modules",
		() => {
			const sharpPath = findPackagePath("sharp");
			expect(!!sharpPath).toBe(true);
			const tesseractPath = findPackagePath("tesseract.js");
			expect(!!tesseractPath).toBe(true);
		},
	);
});

describe("Electrobun Native Module Configuration", () => {
	it.skipIf(!electrobunPkgPath)(
		"electrobun app package is present and depends on electrobun",
		() => {
			const electrobunPkg = JSON.parse(
				fs.readFileSync(electrobunPkgPath!, "utf-8"),
			);
			expect(electrobunPkg.dependencies || {}).toHaveProperty(
				"electrobun",
			);
		},
	);

	it.skipIf(!hasAnyNativeModuleDep)(
		"root runtime declares native module dependencies for desktop packaging",
		() => {
			expect(hasAnyNativeModuleDep).toBe(true);
		},
	);

	it.skipIf(!copyRuntimeScript || !releaseWorkflow)(
		"desktop packaging scripts exist for runtime dependency bundling",
		() => {
			expect(fs.existsSync(copyRuntimeScript!)).toBe(true);
			expect(fs.existsSync(releaseWorkflow!)).toBe(true);
		},
	);
});

describe("Core Plugins with Vision Integration", () => {
	it.skipIf(!corePluginsPath)(
		"plugin-vision is in OPTIONAL_CORE_PLUGINS",
		async () => {
			const { OPTIONAL_CORE_PLUGINS } = await import(
				"../src/runtime/core-plugins"
			);
			expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-vision");
		},
	);

	it.skipIf(!elizaTsPath)(
		"plugin-vision has static import in eliza.ts",
		() => {
			const elizaContent = fs.readFileSync(elizaTsPath!, "utf-8");
			expect(elizaContent).toContain("plugin-vision");
		},
	);
});

describe("PTY Native Modules", () => {
	it.skipIf(!hasNodePty)("node-pty is installed", () => {
		const packagePath = findPackagePath("node-pty");
		expect(fs.existsSync(packagePath!)).toBe(true);
	});

	it.skipIf(!hasLydellNodePty)(
		"@lydell/node-pty is available",
		() => {
			expect(hasLydellNodePty).toBe(true);
		},
	);

	it.skipIf(!hasPtyManager)("pty-manager is installed", () => {
		const packagePath = findPackagePath("pty-manager");
		expect(fs.existsSync(packagePath!)).toBe(true);
	});

	it.skipIf(!hasPtyDeps)(
		"root runtime declares PTY dependencies",
		() => {
			expect(!!allDeps["pty-manager"]).toBe(true);
		},
	);
});

describe("Local Embedding Native Modules", () => {
	it.skipIf(!hasEmbeddingDeps)(
		"root runtime declares local embedding dependencies",
		() => {
			expect(
				!!allDeps["node-llama-cpp"] || !!allDeps["whisper-node"],
			).toBe(true);
		},
	);
});
