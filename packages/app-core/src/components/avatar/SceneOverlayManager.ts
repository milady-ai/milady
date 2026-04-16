/**
 * SceneOverlayManager — manages holographic floating panels in the three.js scene.
 *
 * Creates three billboard panels (chat, agent status, heartbeats) as textured
 * planes with emissive materials. Panels always face the camera and update
 * their canvas textures lazily when data changes.
 */

import * as THREE from "three";
import {
  type AgentStatusOverlay,
  type ChatOverlayMessage,
  renderChatPanel,
  renderHeartbeatsPanel,
  renderStatusPanel,
  type TriggerOverlay,
} from "./scene-overlay-renderer";

// ── Panel configuration ──────────────────────────────────────────────

/** Canvas resolution multiplier for crisp text. */
const CANVAS_SCALE = 2;

interface PanelConfig {
  /** World-space position of the panel center. */
  position: THREE.Vector3;
  /** World-space size (width, height) of the panel quad. */
  size: [width: number, height: number];
  /** Canvas pixel dimensions before CANVAS_SCALE. */
  canvasSize: [width: number, height: number];
}

const CHAT_PANEL: PanelConfig = {
  position: new THREE.Vector3(-0.8, 1.3, 0.2),
  size: [1.0, 1.5],
  canvasSize: [360, 540],
};

const STATUS_PANEL: PanelConfig = {
  position: new THREE.Vector3(0.8, 1.6, 0.2),
  size: [0.9, 0.55],
  canvasSize: [360, 220],
};

const HEARTBEATS_PANEL: PanelConfig = {
  position: new THREE.Vector3(0.8, 0.9, 0.2),
  size: [0.9, 0.65],
  canvasSize: [360, 260],
};

/** GBA monitor: 3:2 aspect ratio matching GBA native 240×160. */
const GBA_MONITOR: PanelConfig = {
  position: new THREE.Vector3(1.2, 1.8, 0.2),
  size: [0.9, 0.6],
  canvasSize: [480, 320],
};

/** Minimum / maximum scale for GBA monitor resize. */
const GBA_MIN_SCALE = 0.5;
const GBA_MAX_SCALE = 2.5;
/** Resize handle size in world units (corner hit area). */
const GBA_RESIZE_HANDLE = 0.2;

// ── OverlayPanel helper ──────────────────────────────────────────────

interface OverlayPanel {
  group: THREE.Group;
  mesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  dirty: boolean;
  /** Current opacity for fade-in animation. */
  opacity: number;
  /** Target opacity (1 when data present, 0 when empty). */
  targetOpacity: number;
}

function createPanel(config: PanelConfig): OverlayPanel {
  const [cw, ch] = config.canvasSize;
  const scaledW = cw * CANVAS_SCALE;
  const scaledH = ch * CANVAS_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = scaledW;
  canvas.height = scaledH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context for overlay panel");

  // Scale context so renderers draw in logical pixels
  ctx.scale(CANVAS_SCALE, CANVAS_SCALE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  const [w, h] = config.size;

  // Main panel mesh — standard depth, default render order.
  // The Spark splat already has renderOrder 9998 to draw behind everything.
  // Panels and VRM use default ordering (0) and rely on normal z-depth.
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);

  // Subtle glow plane behind the panel
  const glowGeometry = new THREE.PlaneGeometry(w * 1.08, h * 1.08);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xf0b90b),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.position.z = -0.01;

  const group = new THREE.Group();
  group.name = "OverlayPanel";
  group.position.copy(config.position);
  group.add(glowMesh);
  group.add(mesh);

  return {
    group,
    mesh,
    glowMesh,
    canvas,
    ctx,
    texture,
    dirty: true,
    opacity: 0,
    targetOpacity: 0,
  };
}

/** GBA monitor variant — dark bezel frame instead of golden glow. */
function createMonitorPanel(config: PanelConfig): OverlayPanel {
  const [cw, ch] = config.canvasSize;
  const scaledW = cw * CANVAS_SCALE;
  const scaledH = ch * CANVAS_SCALE;

  const canvas = document.createElement("canvas");
  canvas.width = scaledW;
  canvas.height = scaledH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context for GBA monitor");

  // Fill with a dark GBA-style background so the monitor is visible before ROM loads
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, scaledW, scaledH);
  // Draw a centered "load ROM" hint
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = `${14 * CANVAS_SCALE}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Click to load ROM", scaledW / 2, scaledH / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const [w, h] = config.size;

  // Screen mesh — depthTest disabled so the monitor draws on top of the avatar
  const geometry = new THREE.PlaneGeometry(w, h);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 100;

  // Bezel — dark frame around the screen
  const bezelPad = 0.06;
  const bezelGeometry = new THREE.PlaneGeometry(
    w + bezelPad * 2,
    h + bezelPad * 2,
  );
  const bezelMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x1a1a2e),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const glowMesh = new THREE.Mesh(bezelGeometry, bezelMaterial);
  glowMesh.renderOrder = 99;
  glowMesh.position.z = -0.005;

  const group = new THREE.Group();
  group.name = "GbaMonitor";
  group.position.copy(config.position);
  group.add(glowMesh);
  group.add(mesh);

  return {
    group,
    mesh,
    glowMesh,
    canvas,
    ctx,
    texture,
    dirty: true,
    opacity: 0,
    targetOpacity: 1,
  };
}

function disposePanel(panel: OverlayPanel): void {
  const mat = panel.mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
  panel.mesh.geometry.dispose();

  const glowMat = panel.glowMesh.material as THREE.MeshBasicMaterial;
  glowMat.dispose();
  panel.glowMesh.geometry.dispose();

  panel.texture.dispose();
  panel.group.removeFromParent();
}

// ── JSON-stable shallow comparison ───────────────────────────────────

function shallowArrayEquals<T>(a: T[], b: T[], keys: (keyof T)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    for (const key of keys) {
      if (a[i]?.[key] !== b[i]?.[key]) return false;
    }
  }
  return true;
}

// ── SceneOverlayManager ─────────────────────────────────────────────

/** Interaction state for the GBA monitor drag/resize. */
type GbaInteraction =
  | { mode: "none" }
  | { mode: "drag"; offsetWorld: THREE.Vector3 }
  | { mode: "resize"; startScale: number; startDistance: number };

export class SceneOverlayManager {
  private chatPanel: OverlayPanel;
  private statusPanel: OverlayPanel;
  private heartbeatsPanel: OverlayPanel;
  private gbaMonitor: OverlayPanel;
  private attached = false;
  private disposed = false;

  // Data snapshots for dirty checking
  private chatData: ChatOverlayMessage[] = [];
  private statusData: AgentStatusOverlay | null = null;
  private heartbeatsData: TriggerOverlay[] = [];

  private fontsChecked = false;

  // ── GBA interaction state ───────────────────────────────────────────
  private gbaInteraction: GbaInteraction = { mode: "none" };
  private gbaScale = 1.0;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  /** Whether the last pointerDown hit the GBA monitor (consumed the event). */
  private gbaConsumedPointer = false;
  /** Whether significant drag movement occurred (suppresses click). */
  private gbaDragMoved = false;
  /** Start position for drag threshold detection. */
  private gbaDragStartX = 0;
  private gbaDragStartY = 0;

  constructor() {
    this.chatPanel = createPanel(CHAT_PANEL);
    this.statusPanel = createPanel(STATUS_PANEL);
    this.heartbeatsPanel = createPanel(HEARTBEATS_PANEL);
    this.gbaMonitor = createMonitorPanel(GBA_MONITOR);
  }

  /** Add panel groups to the scene. Called once when the engine is ready. */
  attach(scene: THREE.Scene): void {
    if (this.attached || this.disposed) return;
    scene.add(this.chatPanel.group);
    scene.add(this.statusPanel.group);
    scene.add(this.heartbeatsPanel.group);
    scene.add(this.gbaMonitor.group);
    this.attached = true;
    // Show the GBA monitor by default so users can click the
    // "Click to load ROM" placeholder to open the file picker.
    this.gbaMonitor.targetOpacity = 1;
  }

  /**
   * Per-frame update: billboard panels toward camera, animate opacity,
   * and repaint dirty canvases.
   */
  update(camera: THREE.PerspectiveCamera, delta: number): void {
    if (this.disposed || !this.attached) return;

    // Lazy font check — re-render all panels once web fonts load
    if (!this.fontsChecked) {
      this.fontsChecked = true;
      void document.fonts.ready.then(() => {
        if (this.disposed) return;
        this.chatPanel.dirty = true;
        this.statusPanel.dirty = true;
        this.heartbeatsPanel.dirty = true;
      });
    }

    this.updatePanel(this.chatPanel, camera, delta);
    this.updatePanel(this.statusPanel, camera, delta);
    this.updatePanel(this.heartbeatsPanel, camera, delta);
    this.updateMonitorPanel(this.gbaMonitor, camera, delta);

    // Repaint GBA monitor when a new frame arrives
    if (this.gbaMonitor.dirty) {
      this.gbaMonitor.dirty = false;
      this.gbaMonitor.texture.needsUpdate = true;
    }

    // Repaint dirty canvases
    if (this.chatPanel.dirty) {
      this.chatPanel.dirty = false;
      this.chatPanel.ctx.save();
      this.chatPanel.ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      renderChatPanel(
        this.chatPanel.ctx,
        CHAT_PANEL.canvasSize[0],
        CHAT_PANEL.canvasSize[1],
        this.chatData,
      );
      this.chatPanel.ctx.restore();
      this.chatPanel.texture.needsUpdate = true;
    }

    if (this.statusPanel.dirty) {
      this.statusPanel.dirty = false;
      this.statusPanel.ctx.save();
      this.statusPanel.ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      renderStatusPanel(
        this.statusPanel.ctx,
        STATUS_PANEL.canvasSize[0],
        STATUS_PANEL.canvasSize[1],
        this.statusData,
      );
      this.statusPanel.ctx.restore();
      this.statusPanel.texture.needsUpdate = true;
    }

    if (this.heartbeatsPanel.dirty) {
      this.heartbeatsPanel.dirty = false;
      this.heartbeatsPanel.ctx.save();
      this.heartbeatsPanel.ctx.setTransform(
        CANVAS_SCALE,
        0,
        0,
        CANVAS_SCALE,
        0,
        0,
      );
      renderHeartbeatsPanel(
        this.heartbeatsPanel.ctx,
        HEARTBEATS_PANEL.canvasSize[0],
        HEARTBEATS_PANEL.canvasSize[1],
        this.heartbeatsData,
      );
      this.heartbeatsPanel.ctx.restore();
      this.heartbeatsPanel.texture.needsUpdate = true;
    }
  }

  // ── Data setters ─────────────────────────────────────────────────

  setChatMessages(messages: ChatOverlayMessage[]): void {
    if (this.disposed) return;
    if (shallowArrayEquals(this.chatData, messages, ["id", "role", "text"])) {
      return;
    }
    this.chatData = messages.map((m) => ({ ...m }));
    this.chatPanel.dirty = true;
    this.chatPanel.targetOpacity = 1;
  }

  setAgentStatus(status: AgentStatusOverlay | null): void {
    if (this.disposed) return;
    const prev = this.statusData;
    if (
      prev?.state === status?.state &&
      prev?.agentName === status?.agentName &&
      prev?.uptime === status?.uptime &&
      prev?.sessions.length === (status?.sessions.length ?? 0)
    ) {
      return;
    }
    this.statusData = status
      ? { ...status, sessions: status.sessions.map((s) => ({ ...s })) }
      : null;
    this.statusPanel.dirty = true;
    this.statusPanel.targetOpacity = status ? 1 : 0;
  }

  setHeartbeats(triggers: TriggerOverlay[]): void {
    if (this.disposed) return;
    if (
      shallowArrayEquals(this.heartbeatsData, triggers, [
        "id",
        "enabled",
        "lastStatus",
      ])
    ) {
      return;
    }
    this.heartbeatsData = triggers.map((t) => ({ ...t }));
    this.heartbeatsPanel.dirty = true;
    this.heartbeatsPanel.targetOpacity = triggers.length > 0 ? 1 : 0;
  }

  // ── GBA monitor ─────────────────────────────────────────────────

  /** Show or hide the floating GBA monitor. */
  setGbaVisible(visible: boolean): void {
    if (this.disposed) return;
    this.gbaMonitor.targetOpacity = visible ? 1 : 0;
  }

  /**
   * Paint a new emulator frame onto the GBA monitor texture.
   * Accepts any CanvasImageSource (ImageBitmap, HTMLCanvasElement, etc.).
   */
  setGbaFrame(source: CanvasImageSource): void {
    if (this.disposed) return;
    const { ctx, canvas } = this.gbaMonitor;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Preserve source aspect ratio — letterbox/pillarbox to fit the canvas
    const sw = (source as ImageBitmap).width ?? canvas.width;
    const sh = (source as ImageBitmap).height ?? canvas.height;
    const scale = Math.min(canvas.width / sw, canvas.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (canvas.width - dw) / 2;
    const dy = (canvas.height - dh) / 2;
    ctx.drawImage(source, dx, dy, dw, dh);

    this.gbaMonitor.dirty = true;
    this.gbaMonitor.targetOpacity = 1;
  }

  // ── GBA monitor pointer interaction ──────────────────────────────

  /**
   * Convert a DOM pointer event to NDC and test against the GBA monitor.
   * Returns the world-space intersection point or null.
   */
  private hitTestGba(
    clientX: number,
    clientY: number,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): THREE.Vector3 | null {
    if (!this.gbaMonitor.group.visible || this.gbaMonitor.opacity < 0.01) {
      return null;
    }
    const rect = domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Force world matrix update so the raycast sees the current billboard pose
    this.gbaMonitor.group.updateMatrixWorld(true);

    this.raycaster.setFromCamera(this.pointerNdc, camera);
    const hits = this.raycaster.intersectObject(this.gbaMonitor.mesh);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  /**
   * Check whether a point is in the resize corner (bottom-right) of the monitor.
   */
  private isResizeCorner(hitPoint: THREE.Vector3): boolean {
    const [w, h] = GBA_MONITOR.size;
    const sw = (w * this.gbaScale) / 2;
    const sh = (h * this.gbaScale) / 2;
    // Transform hit into monitor-local space
    const local = hitPoint
      .clone()
      .sub(this.gbaMonitor.group.position)
      .applyQuaternion(this.gbaMonitor.group.quaternion.clone().invert());
    // Bottom-right corner region
    return (
      local.x > sw - GBA_RESIZE_HANDLE * this.gbaScale &&
      local.y < -sh + GBA_RESIZE_HANDLE * this.gbaScale
    );
  }

  /**
   * Handle pointerDown on the canvas. Returns true if the event was consumed
   * (hit the GBA monitor), so the caller can suppress orbit controls.
   */
  handlePointerDown(
    clientX: number,
    clientY: number,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): boolean {
    this.gbaConsumedPointer = false;
    if (this.disposed) return false;
    const hit = this.hitTestGba(clientX, clientY, camera, domElement);
    if (!hit) return false;

    this.gbaConsumedPointer = true;
    this.gbaDragMoved = false;
    this.gbaDragStartX = clientX;
    this.gbaDragStartY = clientY;

    if (this.isResizeCorner(hit)) {
      // Start resize interaction
      const center = this.gbaMonitor.group.position.clone();
      this.gbaInteraction = {
        mode: "resize",
        startScale: this.gbaScale,
        startDistance: hit.distanceTo(center),
      };
    } else {
      // Start drag interaction
      const offset = this.gbaMonitor.group.position.clone().sub(hit);
      this.gbaInteraction = { mode: "drag", offsetWorld: offset };
    }
    return true;
  }

  /**
   * Handle pointerMove. Updates drag position or resize scale.
   */
  handlePointerMove(
    clientX: number,
    clientY: number,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): boolean {
    if (this.disposed || this.gbaInteraction.mode === "none") return false;
    // Only count as a drag after 5px of movement — sub-pixel jitter shouldn't
    // suppress the tap-to-upload click.
    if (!this.gbaDragMoved) {
      const dx = clientX - this.gbaDragStartX;
      const dy = clientY - this.gbaDragStartY;
      if (dx * dx + dy * dy > 25) this.gbaDragMoved = true;
      else return true; // still within threshold, don't move the monitor yet
    }

    const rect = domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, camera);

    if (this.gbaInteraction.mode === "drag") {
      // Project onto a plane at the monitor's current depth from camera
      const monitorPos = this.gbaMonitor.group.position;
      const cameraDir = new THREE.Vector3()
        .subVectors(monitorPos, camera.position)
        .normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraDir,
        monitorPos,
      );
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, target)) {
        this.gbaMonitor.group.position.copy(
          target.add(this.gbaInteraction.offsetWorld),
        );
      }
    } else if (this.gbaInteraction.mode === "resize") {
      // Scale based on distance from center
      const center = this.gbaMonitor.group.position.clone();
      const cameraDir = new THREE.Vector3()
        .subVectors(center, camera.position)
        .normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraDir,
        center,
      );
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, target)) {
        const currentDist = target.distanceTo(center);
        const ratio = currentDist / this.gbaInteraction.startDistance;
        this.gbaScale = Math.max(
          GBA_MIN_SCALE,
          Math.min(GBA_MAX_SCALE, this.gbaInteraction.startScale * ratio),
        );
        this.gbaMonitor.group.scale.setScalar(this.gbaScale);
      }
    }
    return true;
  }

  /**
   * Handle pointerUp. Ends drag/resize.
   */
  handlePointerUp(): void {
    this.gbaInteraction = { mode: "none" };
    this.gbaConsumedPointer = false;
  }

  /**
   * Handle a click on the GBA monitor (tap without drag).
   * Returns true if the click hit the monitor and should trigger ROM upload.
   * Suppressed when the pointer was dragged significantly.
   */
  handleClick(
    clientX: number,
    clientY: number,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): boolean {
    if (this.disposed || this.gbaDragMoved) return false;
    const hit = this.hitTestGba(clientX, clientY, camera, domElement);
    return hit !== null;
  }

  /** Whether the overlay is currently consuming pointer events (dragging/resizing). */
  isInteracting(): boolean {
    return this.gbaInteraction.mode !== "none";
  }

  /** Whether significant drag/resize movement occurred during this gesture. */
  wasDragged(): boolean {
    return this.gbaDragMoved;
  }

  /** Get the cursor style based on what the pointer is hovering over. */
  getGbaCursor(
    clientX: number,
    clientY: number,
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): string | null {
    if (this.disposed) return null;
    if (this.gbaInteraction.mode === "drag") return "grabbing";
    if (this.gbaInteraction.mode === "resize") return "nwse-resize";
    const hit = this.hitTestGba(clientX, clientY, camera, domElement);
    if (!hit) return null;
    if (this.isResizeCorner(hit)) return "nwse-resize";
    return "grab";
  }

  /**
   * Project the GBA monitor's top-center to screen (CSS) pixels.
   * Returns { x, y, visible } where (x, y) is the top-center of the monitor
   * in viewport coordinates, or visible=false if the monitor is hidden.
   */
  getGbaScreenTopCenter(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ): { x: number; y: number; visible: boolean } {
    if (
      this.disposed ||
      !this.gbaMonitor.group.visible ||
      this.gbaMonitor.opacity < 0.01
    ) {
      return { x: 0, y: 0, visible: false };
    }
    const [, h] = GBA_MONITOR.size;
    // Top-center in local space is (0, +halfHeight, 0)
    const topCenter = new THREE.Vector3(0, (h * this.gbaScale) / 2, 0);
    // Transform to world space
    this.gbaMonitor.group.updateMatrixWorld(true);
    topCenter.applyMatrix4(this.gbaMonitor.group.matrixWorld);
    // Project to NDC
    topCenter.project(camera);
    const rect = domElement.getBoundingClientRect();
    return {
      x: ((topCenter.x + 1) / 2) * rect.width + rect.left,
      y: ((-topCenter.y + 1) / 2) * rect.height + rect.top,
      visible: true,
    };
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposePanel(this.chatPanel);
    disposePanel(this.statusPanel);
    disposePanel(this.heartbeatsPanel);
    disposePanel(this.gbaMonitor);
  }

  // ── Internal ─────────────────────────────────────────────────────

  private updatePanel(
    panel: OverlayPanel,
    camera: THREE.PerspectiveCamera,
    delta: number,
  ): void {
    // Billboard: make panel face the camera
    panel.group.quaternion.copy(camera.quaternion);

    // Animate opacity
    const fadeSpeed = 3.0; // units per second
    if (Math.abs(panel.opacity - panel.targetOpacity) > 0.001) {
      if (panel.opacity < panel.targetOpacity) {
        panel.opacity = Math.min(
          panel.targetOpacity,
          panel.opacity + delta * fadeSpeed,
        );
      } else {
        panel.opacity = Math.max(
          panel.targetOpacity,
          panel.opacity - delta * fadeSpeed,
        );
      }
      const mat = panel.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = panel.opacity * 0.92;

      const glowMat = panel.glowMesh.material as THREE.MeshBasicMaterial;
      glowMat.opacity = panel.opacity * 0.04;
    }

    // Hide group entirely when fully faded out
    panel.group.visible = panel.opacity > 0.001;
  }

  /** Like updatePanel, but the bezel is rendered at full opacity. */
  private updateMonitorPanel(
    panel: OverlayPanel,
    camera: THREE.PerspectiveCamera,
    delta: number,
  ): void {
    panel.group.quaternion.copy(camera.quaternion);

    const fadeSpeed = 3.0;
    if (Math.abs(panel.opacity - panel.targetOpacity) > 0.001) {
      if (panel.opacity < panel.targetOpacity) {
        panel.opacity = Math.min(
          panel.targetOpacity,
          panel.opacity + delta * fadeSpeed,
        );
      } else {
        panel.opacity = Math.max(
          panel.targetOpacity,
          panel.opacity - delta * fadeSpeed,
        );
      }
      const mat = panel.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = panel.opacity;

      // Solid bezel frame
      const bezelMat = panel.glowMesh.material as THREE.MeshBasicMaterial;
      bezelMat.opacity = panel.opacity * 0.95;
    }

    panel.group.visible = panel.opacity > 0.001;
  }
}
