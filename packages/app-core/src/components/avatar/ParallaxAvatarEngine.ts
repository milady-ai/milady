/**
 * ParallaxAvatarEngine — layered 2D illustration renderer with depth-map parallax,
 * procedural blinking, mouth sync, eye tracking, personality-driven entrance,
 * and alive idle micro-movements.
 *
 * This is a plain class (no React). The React wrapper is ParallaxAvatarViewer.
 */

import {
  CHAT_AVATAR_VOICE_EVENT,
  type ChatAvatarVoiceEventDetail,
  VRM_TELEPORT_COMPLETE_EVENT,
} from "../../events";
import { PARALLAX_LAYER_ORDER } from "./parallax-layer-order";
import { VrmBlinkController } from "./VrmBlinkController";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParallaxEngineState {
  loaded: boolean;
  loadError: string | null;
  loadingProgress: number;
  revealComplete: boolean;
}

type StateCallback = (state: ParallaxEngineState) => void;

interface LayerTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

interface LayerData {
  stem: string;
  image: HTMLImageElement;
  scaled: HTMLCanvasElement | null;
  avgDepth: number;
  empty: boolean;
  transform: LayerTransform;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PARALLAX_PX = 40;
const DEPTH_SAMPLE_SIZE = 64;
const POINTER_LERP = 0.08;

// Framing — slight zoom, shift down so head/face is centered and legs are cropped
const FRAME_SCALE = 1.2; // mild zoom
const FRAME_OFFSET_Y = 0.15; // positive = push character down in frame, cropping legs

// Global idle
const IDLE_FLOAT_PX = 3;
const IDLE_FLOAT_SPEED = 0.8;
const IDLE_BREATHE_AMP = 0.004;
const IDLE_BREATHE_SPEED = 1.2;

// Entrance
const ENTRANCE_DURATION = 1.6; // seconds

// Mouth
const MOUTH_OPEN_ALPHA = 0.3;
const MOUTH_CLOSE_ALPHA = 0.2;

// Eye tracking (px, on top of global parallax)
const EYE_TRACK_X = 5;
const EYE_TRACK_Y = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

function sampleAverageDepth(depthImg: HTMLImageElement): number {
  const canvas = document.createElement("canvas");
  canvas.width = DEPTH_SAMPLE_SIZE;
  canvas.height = DEPTH_SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0.5;
  ctx.drawImage(depthImg, 0, 0, DEPTH_SAMPLE_SIZE, DEPTH_SAMPLE_SIZE);
  const margin = Math.floor(DEPTH_SAMPLE_SIZE * 0.25);
  const sampleW = DEPTH_SAMPLE_SIZE - margin * 2;
  const sampleH = DEPTH_SAMPLE_SIZE - margin * 2;
  const data = ctx.getImageData(margin, margin, sampleW, sampleH).data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    sum += data[i];
    count++;
  }
  return count > 0 ? sum / count / 255 : 0.5;
}

function isLayerEmpty(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  ctx.drawImage(img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 10) return false;
  }
  return true;
}

function preScale(
  img: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function identityTransform(): LayerTransform {
  return { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
}

/** Ease-out cubic. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Ease-out-back: overshoots then settles. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class ParallaxAvatarEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layers: LayerData[] = [];
  private layerMap = new Map<string, LayerData>();
  private assetBasePath: string;

  // Pointer
  private pointerTargetX = 0;
  private pointerTargetY = 0;
  private pointerCurrentX = 0;
  private pointerCurrentY = 0;

  // Timing
  private rafId = 0;
  private startTime = 0;
  private lastFrameTime = 0;
  private paused = false;

  // Display
  private displayWidth = 0;
  private displayHeight = 0;

  // Blink
  private blinkController = new VrmBlinkController();

  // Mouth sync
  private mouthOpenTarget = 0;
  private mouthSmoothed = 0;
  private isSpeaking = false;
  private speakingStartTime = 0;
  private voiceHandler: ((e: Event) => void) | null = null;

  // Entrance animation
  private entranceProgress = 0;
  private entranceComplete = false;
  private entranceBlinked = false;

  // State callbacks
  private _loaded = false;
  private _loadError: string | null = null;
  private _loadingProgress = 0;
  private _onState: StateCallback | null = null;
  private _disposed = false;

  constructor(canvas: HTMLCanvasElement, assetBasePath: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.assetBasePath = assetBasePath.replace(/\/$/, "");
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.setupVoiceListener();
  }

  // ── Voice event listener ────────────────────────────────────────

  private setupVoiceListener(): void {
    this.voiceHandler = (e: Event) => {
      const detail = (e as CustomEvent<ChatAvatarVoiceEventDetail>).detail;
      if (!detail) return;
      this.mouthOpenTarget = detail.mouthOpen ?? 0;
      const wasSpeaking = this.isSpeaking;
      this.isSpeaking = detail.isSpeaking ?? false;
      if (this.isSpeaking && !wasSpeaking) {
        this.speakingStartTime = performance.now() / 1000;
      }
    };
    window.addEventListener(CHAT_AVATAR_VOICE_EVENT, this.voiceHandler);
  }

  // ── Public API ──────────────────────────────────────────────────

  setStateCallback(cb: StateCallback): void {
    this._onState = cb;
  }

  private emitState(): void {
    this._onState?.({
      loaded: this._loaded,
      loadError: this._loadError,
      loadingProgress: this._loadingProgress,
      revealComplete: this.entranceComplete,
    });
  }

  async load(): Promise<void> {
    if (this._disposed) return;
    const totalAssets = PARALLAX_LAYER_ORDER.length * 2;
    let loadedCount = 0;

    try {
      const layerPromises = PARALLAX_LAYER_ORDER.map(async (stem) => {
        const layerUrl = `${this.assetBasePath}/${stem}.png`;
        const depthUrl = `${this.assetBasePath}/${stem}_depth.png`;

        const [image, depthImg] = await Promise.all([
          loadImage(layerUrl).then((img) => {
            loadedCount++;
            this._loadingProgress = loadedCount / totalAssets;
            this.emitState();
            return img;
          }),
          loadImage(depthUrl)
            .then((img) => {
              loadedCount++;
              this._loadingProgress = loadedCount / totalAssets;
              this.emitState();
              return img;
            })
            .catch(() => {
              loadedCount++;
              this._loadingProgress = loadedCount / totalAssets;
              this.emitState();
              return null;
            }),
        ]);

        const empty = isLayerEmpty(image);
        const avgDepth = depthImg ? sampleAverageDepth(depthImg) : 0.5;

        return {
          stem,
          image,
          scaled: null as HTMLCanvasElement | null,
          avgDepth,
          empty,
          transform: identityTransform(),
        } satisfies LayerData;
      });

      this.layers = await Promise.all(layerPromises);
      if (this._disposed) return;

      this.layerMap.clear();
      for (const layer of this.layers) {
        this.layerMap.set(layer.stem, layer);
      }

      this.rescaleLayers();
      this._loaded = true;
      this._loadingProgress = 1;
      this.emitState();
      this.startLoop();
    } catch (err) {
      if (this._disposed) return;
      this._loadError =
        err instanceof Error ? err.message : "Failed to load avatar layers";
      this.emitState();
    }
  }

  private rescaleLayers(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;
    this.displayWidth = w;
    this.displayHeight = h;
    for (const layer of this.layers) {
      if (layer.empty) continue;
      layer.scaled = preScale(layer.image, w, h);
    }
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (
      this._loaded &&
      (this.canvas.width !== this.displayWidth ||
        this.canvas.height !== this.displayHeight)
    ) {
      this.rescaleLayers();
    }
  }

  setPointerPosition(normalizedX: number, normalizedY: number): void {
    this.pointerTargetX = Math.max(-1, Math.min(1, normalizedX));
    this.pointerTargetY = Math.max(-1, Math.min(1, normalizedY));
  }

  pause(): void { this.paused = true; }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.lastFrameTime = performance.now();
      this.startLoop();
    }
  }

  dispose(): void {
    this._disposed = true;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (this.voiceHandler) {
      window.removeEventListener(CHAT_AVATAR_VOICE_EVENT, this.voiceHandler);
      this.voiceHandler = null;
    }
    this.layers = [];
    this.layerMap.clear();
    this._onState = null;
  }

  // ── Animation: Blink ────────────────────────────────────────────

  private updateBlink(delta: number): void {
    const blinkValue = this.blinkController.update(delta);
    const eyewhite = this.layerMap.get("eyewhite");
    const irides = this.layerMap.get("irides");
    if (eyewhite) eyewhite.transform.opacity = 1 - blinkValue;
    if (irides) irides.transform.opacity = 1 - blinkValue;
  }

  // ── Animation: Mouth sync ──────────────────────────────────────

  private updateMouth(elapsed: number): void {
    let target: number;
    if (this.isSpeaking) {
      const t = elapsed - this.speakingStartTime;
      const base = Math.sin(t * 12) * 0.3 + 0.4;
      const detail = Math.sin(t * 18.7) * 0.15;
      const slow = Math.sin(t * 4.2) * 0.1;
      target = Math.max(0, Math.min(1, base + detail + slow));
    } else {
      target = this.mouthOpenTarget;
    }
    const alpha = target > this.mouthSmoothed ? MOUTH_OPEN_ALPHA : MOUTH_CLOSE_ALPHA;
    this.mouthSmoothed += (target - this.mouthSmoothed) * alpha;

    const mouth = this.layerMap.get("mouth");
    if (mouth) {
      mouth.transform.scaleY = 1 + this.mouthSmoothed * 0.8;
      mouth.transform.translateY += this.mouthSmoothed * 4;
    }
  }

  // ── Animation: Eye tracking ────────────────────────────────────

  private updateEyeTracking(): void {
    const irides = this.layerMap.get("irides");
    if (irides) {
      irides.transform.translateX += this.pointerCurrentX * EYE_TRACK_X;
      irides.transform.translateY += this.pointerCurrentY * EYE_TRACK_Y;
    }
  }

  // ── Animation: Idle micro-movements ────────────────────────────

  /** All layers that move as the head. */
  private static readonly HEAD_GROUP = [
    "face", "ears", "earwear", "eyewhite", "irides", "eyelash",
    "eyebrow", "eyewear", "nose", "mouth", "headwear", "front-hair",
    "back-hair", "neckwear",
  ];

  private updateIdleMicro(elapsed: number): void {
    // ── Head tilt + lateral sway ──────────────────────────────────
    const headTilt = Math.sin(elapsed * 0.25) * 0.018;
    const headSwayX = Math.sin(elapsed * 0.3 + 0.7) * 6;
    const headSwayY = Math.sin(elapsed * 0.22) * 2;

    for (const stem of ParallaxAvatarEngine.HEAD_GROUP) {
      const layer = this.layerMap.get(stem);
      if (!layer) continue;
      layer.transform.rotation += headTilt;
      layer.transform.translateX += headSwayX;
      layer.transform.translateY += headSwayY;
    }

    // ── Hair extra sway (trails behind head) ─────────────────────
    const frontHair = this.layerMap.get("front-hair");
    if (frontHair) {
      frontHair.transform.translateX += Math.sin(elapsed * 0.4) * 3;
      frontHair.transform.rotation += Math.sin(elapsed * 0.35) * 0.012;
    }
    const backHair = this.layerMap.get("back-hair");
    if (backHair) {
      backHair.transform.translateX += Math.sin(elapsed * 0.4 + 1.2) * 2.5;
      backHair.transform.rotation += Math.sin(elapsed * 0.3 + 2.0) * 0.008;
    }

    // ── Body breathing ───────────────────────────────────────────
    const topwear = this.layerMap.get("topwear");
    if (topwear) {
      topwear.transform.scaleY = 1 + Math.sin(elapsed * IDLE_BREATHE_SPEED) * 0.006;
      topwear.transform.scaleX = 1 + Math.sin(elapsed * IDLE_BREATHE_SPEED) * 0.003;
    }

    // ── Arm/hand fidget ──────────────────────────────────────────
    const handwear = this.layerMap.get("handwear");
    if (handwear) {
      handwear.transform.translateX += Math.sin(elapsed * 0.5 + 1.0) * 2;
      handwear.transform.translateY += Math.sin(elapsed * 0.35) * 1.5;
      handwear.transform.rotation += Math.sin(elapsed * 0.45 + 0.3) * 0.01;
    }

    // ── Eyebrow life ─────────────────────────────────────────────
    const eyebrow = this.layerMap.get("eyebrow");
    if (eyebrow) {
      eyebrow.transform.translateY += Math.sin(elapsed * 0.6 + 0.5) * 0.8;
    }

    // ── Tail wag ─────────────────────────────────────────────────
    const tail = this.layerMap.get("tail");
    if (tail) {
      tail.transform.rotation += Math.sin(elapsed * 0.7) * 0.03;
      tail.transform.translateX += Math.sin(elapsed * 0.55) * 4;
    }
  }

  // ── Animation: Entrance ────────────────────────────────────────
  //
  // Personality entrance: swings in from the right with a tilt,
  // hair trails behind, settles with a head cock + quick double-blink.
  // NOT a mechanical slide — feels like she just walked up.

  private updateEntrance(delta: number): void {
    if (this.entranceComplete) return;
    this.entranceProgress = Math.min(1, this.entranceProgress + delta / ENTRANCE_DURATION);

    // Trigger a quick double-blink when the swing-in is ~70% done
    if (this.entranceProgress > 0.7 && !this.entranceBlinked) {
      this.entranceBlinked = true;
      this.blinkController.reset(); // forces an immediate blink
    }

    if (this.entranceProgress >= 1) {
      this.entranceComplete = true;
      this.emitState();
      window.dispatchEvent(new Event(VRM_TELEPORT_COMPLETE_EVENT));
    }
  }

  private applyEntrance(): void {
    if (this.entranceComplete) return;
    const p = this.entranceProgress;

    // Phase 1 (0-0.6): swing in from right with tilt
    // Phase 2 (0.6-1.0): settle with slight overshoot head cock
    const swingP = Math.min(1, p / 0.6);
    const settleP = Math.max(0, (p - 0.6) / 0.4);

    const swingEase = easeOutBack(swingP);
    const settleEase = easeOut(settleP);

    // Swing from right: starts at +120px, overshoots slightly left, settles at 0
    const swingX = (1 - swingEase) * 120;
    // Tilt during swing: starts tilted 0.04 rad, settles to 0
    const swingTilt = (1 - swingEase) * 0.04;
    // Settle head cock: small tilt the other way then back
    const settleTilt = settleP > 0 ? Math.sin(settleP * Math.PI) * -0.015 : 0;
    // Opacity: quick fade in during first 20%
    const fadeIn = Math.min(1, p * 5);
    // Scale: starts slightly small, bounces to normal
    const entranceScale = 0.85 + 0.15 * swingEase;

    // Hair trails behind the swing (extra offset that decays)
    const hairTrailX = (1 - swingEase) * 40;
    const hairTrailRot = (1 - swingEase) * 0.03;

    for (const layer of this.layers) {
      if (layer.empty) continue;
      const t = layer.transform;

      t.translateX += swingX;
      t.rotation += swingTilt + settleTilt;
      t.opacity *= fadeIn;
      t.scaleX *= entranceScale;
      t.scaleY *= entranceScale;
    }

    // Hair trails further behind
    const frontHair = this.layerMap.get("front-hair");
    if (frontHair) {
      frontHair.transform.translateX += hairTrailX;
      frontHair.transform.rotation += hairTrailRot;
    }
    const backHair = this.layerMap.get("back-hair");
    if (backHair) {
      backHair.transform.translateX += hairTrailX * 1.3;
      backHair.transform.rotation += hairTrailRot * 1.2;
    }

    // Tail swings opposite
    const tail = this.layerMap.get("tail");
    if (tail) {
      tail.transform.translateX -= hairTrailX * 0.5;
      tail.transform.rotation -= hairTrailRot;
    }

    // Handwear swings with momentum
    const handwear = this.layerMap.get("handwear");
    if (handwear) {
      const armSwing = Math.sin(swingP * Math.PI * 1.5) * (1 - settleEase);
      handwear.transform.translateX += armSwing * 15;
      handwear.transform.rotation += armSwing * 0.02;
    }
  }

  // ── Render loop ─────────────────────────────────────────────────

  private startLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tick = () => {
      if (this._disposed || this.paused) { this.rafId = 0; return; }
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private render(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 1 / 30);
    this.lastFrameTime = now;
    const elapsed = (now - this.startTime) / 1000;

    // Spring-damp pointer
    this.pointerCurrentX += (this.pointerTargetX - this.pointerCurrentX) * POINTER_LERP;
    this.pointerCurrentY += (this.pointerTargetY - this.pointerCurrentY) * POINTER_LERP;

    // Global idle
    const idleFloatY = Math.sin(elapsed * IDLE_FLOAT_SPEED) * IDLE_FLOAT_PX;
    const idleBreathe = 1 + Math.sin(elapsed * IDLE_BREATHE_SPEED) * IDLE_BREATHE_AMP;

    // Reset transforms
    for (const layer of this.layers) {
      const t = layer.transform;
      t.translateX = 0; t.translateY = 0;
      t.scaleX = 1; t.scaleY = 1;
      t.rotation = 0; t.opacity = 1;
    }

    // Animation subsystems
    this.updateBlink(delta);
    this.updateMouth(elapsed);
    this.updateEyeTracking();
    this.updateIdleMicro(elapsed);
    this.updateEntrance(delta);
    this.applyEntrance();

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Framing offset — zoom into upper body
    const frameOffsetY = h * FRAME_OFFSET_Y;

    // Draw layers back-to-front
    for (const layer of this.layers) {
      if (layer.empty || !layer.scaled) continue;

      const t = layer.transform;
      const dx = this.pointerCurrentX * layer.avgDepth * MAX_PARALLAX_PX + t.translateX;
      const dy = this.pointerCurrentY * layer.avgDepth * MAX_PARALLAX_PX + idleFloatY + t.translateY;

      ctx.save();
      if (t.opacity < 1) ctx.globalAlpha = Math.max(0, t.opacity);
      // Translate to canvas center + framing offset + per-layer offset
      ctx.translate(w / 2 + dx, h / 2 + frameOffsetY + dy);
      ctx.rotate(t.rotation);
      ctx.scale(
        FRAME_SCALE * idleBreathe * t.scaleX,
        FRAME_SCALE * idleBreathe * t.scaleY,
      );
      ctx.drawImage(layer.scaled, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
}
