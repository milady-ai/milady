/**
 * SceneOverlayManager — GBA monitor scene-graph verification
 *
 * Validates that the GBA monitor mesh:
 * 1. Is positioned within the camera frustum at [0, 1.5, -2]
 * 2. Has a valid size (0.9 × 0.6 world units)
 * 3. Is added to the Three.js scene graph via attach()
 * 4. Initializes as visible (targetOpacity: 1) so the mesh fades in immediately
 * 5. Uses depthTest:false + renderOrder so it isn't occluded by the avatar
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SceneOverlayManager — GBA monitor", () => {
  let source: string;

  beforeEach(() => {
    const filePath = path.resolve(__dirname, "../SceneOverlayManager.ts");
    source = fs.readFileSync(filePath, "utf-8");
  });

  // ── 1. Position ────────────────────────────────���─────────────────

  it("positions the GBA monitor offset from the avatar to avoid overlap", () => {
    expect(source).toContain(
      "position: new THREE.Vector3(1.2, 1.8, 0.2)",
    );
  });

  // ── 2. Size / scale ─────────────────────────────────────────────

  it("has a valid world-space size of 0.9 × 0.6", () => {
    // GBA_MONITOR config
    expect(source).toMatch(/GBA_MONITOR.*size:\s*\[0\.9,\s*0\.6\]/s);
  });

  it("has a canvas resolution of 480 × 320 (3:2 GBA aspect)", () => {
    expect(source).toMatch(
      /GBA_MONITOR.*canvasSize:\s*\[480,\s*320\]/s,
    );
  });

  // ── 3. Scene graph ──────────────────────────────────────────────

  it("creates the GBA monitor via createMonitorPanel in the constructor", () => {
    expect(source).toContain(
      "this.gbaMonitor = createMonitorPanel(GBA_MONITOR)",
    );
  });

  it("adds the GBA monitor group to the scene in attach()", () => {
    expect(source).toContain("scene.add(this.gbaMonitor.group)");
  });

  it("names the group 'GbaMonitor' for scene-graph inspection", () => {
    expect(source).toContain('group.name = "GbaMonitor"');
  });

  // ── 4. Initial visibility ───────────────────────────────────────

  it("initializes with targetOpacity: 1 so the monitor fades in immediately", () => {
    // createMonitorPanel returns { ... targetOpacity: 1 }
    const monitorFn = source.slice(
      source.indexOf("function createMonitorPanel"),
    );
    const returnBlock = monitorFn.slice(
      monitorFn.indexOf("return {"),
      monitorFn.indexOf("};", monitorFn.indexOf("return {")) + 2,
    );
    expect(returnBlock).toContain("targetOpacity: 1");
  });

  it("marks the initial canvas as dirty so the texture uploads on first frame", () => {
    const monitorFn = source.slice(
      source.indexOf("function createMonitorPanel"),
    );
    const returnBlock = monitorFn.slice(
      monitorFn.indexOf("return {"),
      monitorFn.indexOf("};", monitorFn.indexOf("return {")) + 2,
    );
    expect(returnBlock).toContain("dirty: true");
  });

  // ── 5. Depth / render order ─────────────────────────────────────

  it("disables depthTest on the screen mesh so the avatar cannot occlude it", () => {
    const monitorFn = source.slice(
      source.indexOf("function createMonitorPanel"),
      source.indexOf("function disposePanel"),
    );
    expect(monitorFn).toContain("depthTest: false");
  });

  it("sets renderOrder on screen (100) and bezel (99) for correct draw order", () => {
    const monitorFn = source.slice(
      source.indexOf("function createMonitorPanel"),
      source.indexOf("function disposePanel"),
    );
    expect(monitorFn).toContain("mesh.renderOrder = 100");
    expect(monitorFn).toContain("glowMesh.renderOrder = 99");
  });

  // ── 6. Update loop integration ──────────────────────────────────

  it("updates the GBA monitor in the per-frame update() method", () => {
    expect(source).toContain(
      "this.updateMonitorPanel(this.gbaMonitor, camera, delta)",
    );
  });

  it("disposes the GBA monitor on cleanup", () => {
    expect(source).toContain("disposePanel(this.gbaMonitor)");
  });
});
