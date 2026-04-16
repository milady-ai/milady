/**
 * 3D bouncing ball overlay for the chat window.
 *
 * Renders a CSS-based 3D ball that bounces within its parent container
 * boundaries using requestAnimationFrame physics. Includes a perspective
 * floor grid, shadow, fading trail dots, drag-to-throw interaction,
 * and a basketball hoop in the top-right corner.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const BALL_RADIUS = 25;
const BALL_MASS = 1.0;
const GRAVITY = 0.55;
/** Coefficient of restitution — vertical bounce energy retention. */
const COR_VERTICAL = 0.68;
/** Coefficient of restitution — horizontal (wall) bounce. */
const COR_HORIZONTAL = 0.78;
/** Air drag coefficient (quadratic). Higher = more resistance. */
const AIR_DRAG = 0.0008;
/** Rolling friction coefficient on ground. */
const ROLLING_FRICTION = 0.985;
/** Sliding friction on ground contact. */
const GROUND_FRICTION = 0.94;
/** Terminal velocity cap (prevents tunnelling on very fast throws). */
const TERMINAL_VELOCITY = 35;
const TRAIL_COUNT = 12;
const DEPTH = 400;
/** Frames the ball must be near-rest before a random kick. */
const REST_FRAMES_KICK = 40;
/** Throw velocity multiplier (mouse delta → ball velocity). */
const THROW_SCALE = 1.6;
/** Deformation spring stiffness — how fast ball shape recovers. */
const DEFORM_SPRING = 0.18;
/** Deformation damping — prevents springy oscillation. */
const DEFORM_DAMP = 0.55;
/** Maximum squash ratio (0 = no deformation, 0.55 = very squishy). */
const MAX_SQUASH = 0.25;
/** Minimum stretch ratio for upward velocity. */
const MAX_STRETCH = 0.15;
/** Maximum angular velocity (radians/frame). Clamps spin to prevent wild flipping. */
const MAX_SPIN = 0.12;
/** Rotational inertia damping — applied each frame on top of air-drag decay. */
const SPIN_DAMPING = 0.92;

// --- Hoop geometry (relative to container) ---
const HOOP_RIGHT_OFFSET = 60; // px from right edge to hoop center
const HOOP_TOP_OFFSET = 70; // px from top edge to rim
const RIM_RADIUS = 32; // inner rim opening
const RIM_THICKNESS = 4;
const BACKBOARD_W = 6;
const BACKBOARD_H = 70;

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Current squash/stretch factor (1 = neutral, <1 = squashed, >1 = stretched). */
  squash: number;
  /** Velocity of the squash factor (for spring dynamics). */
  squashVel: number;
  /** Angular velocity for spin visual (rad/frame). */
  spin: number;
  /** Accumulated rotation angle (radians). */
  angle: number;
  restFrames: number;
}

interface DragState {
  active: boolean;
  /** Where on the ball the grab happened (offset from ball center). */
  offsetX: number;
  offsetY: number;
  /** Recent pointer positions for velocity calculation. */
  history: { x: number; y: number; t: number }[];
}

interface Trail {
  x: number;
  y: number;
  size: number;
  life: number;
}

export function BouncingBall() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<BallState>({
    x: 350,
    y: 150,
    z: DEPTH / 2,
    vx: 4.5,
    vy: 0,
    vz: 3.2,
    squash: 1,
    squashVel: 0,
    spin: 0,
    angle: 0,
    restFrames: 0,
  });
  const dragRef = useRef<DragState>({
    active: false,
    offsetX: 0,
    offsetY: 0,
    history: [],
  });
  const trailsRef = useRef<Trail[]>(
    Array.from({ length: TRAIL_COUNT }, () => ({
      x: 350,
      y: 150,
      size: 0,
      life: 0,
    })),
  );
  const trailIdxRef = useRef(0);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [visible, setVisible] = useState(true);
  const [score, setScore] = useState(0);
  /** Frames remaining for the score flash animation. */
  const scoreFlashRef = useRef(0);
  /** Prevents double-scoring on a single pass-through. */
  const scoredRef = useRef(false);

  const ballRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const hoopRef = useRef<HTMLDivElement>(null);
  const netFlashRef = useRef<HTMLDivElement>(null);
  const trailElsRef = useRef<(HTMLDivElement | null)[]>([]);

  const setTrailRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      trailElsRef.current[index] = el;
    },
    [],
  );

  // --- Drag handlers ---
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const s = stateRef.current;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - s.x;
    const dy = my - s.y;
    // Hit test — generous radius so it's easy to grab
    if (dx * dx + dy * dy > (BALL_RADIUS + 12) ** 2) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const drag = dragRef.current;
    drag.active = true;
    drag.offsetX = dx;
    drag.offsetY = dy;
    drag.history = [{ x: mx, y: my, t: performance.now() }];
    // Kill velocity while held
    s.vx = 0;
    s.vy = 0;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const s = stateRef.current;
    s.x = mx - drag.offsetX;
    s.y = my - drag.offsetY;
    // Clamp inside container
    s.x = Math.max(BALL_RADIUS, Math.min(container.clientWidth - BALL_RADIUS, s.x));
    s.y = Math.max(BALL_RADIUS, Math.min(container.clientHeight - BALL_RADIUS, s.y));
    const now = performance.now();
    drag.history.push({ x: mx, y: my, t: now });
    // Keep only last ~80ms of history
    while (drag.history.length > 1 && now - drag.history[0].t > 80) {
      drag.history.shift();
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const s = stateRef.current;
    const h = drag.history;
    if (h.length >= 2) {
      const first = h[0];
      const last = h[h.length - 1];
      const dt = (last.t - first.t) / 16.67; // normalize to ~60fps frames
      if (dt > 0.1) {
        s.vx = ((last.x - first.x) / dt) * THROW_SCALE;
        s.vy = ((last.y - first.y) / dt) * THROW_SCALE;
        // Impart spin from horizontal throw velocity
        s.spin = s.vx * 0.02;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const ball = ballRef.current;
    const shadow = shadowRef.current;
    if (!container || !ball || !shadow) return;

    const s = stateRef.current;
    // Initialize position to container center
    const initRect = container.getBoundingClientRect();
    s.x = initRect.width / 2;
    s.y = initRect.height / 3;

    // Track previous container size so we can reposition on resize
    let prevW = initRect.width;
    let prevH = initRect.height;

    /** Previous Y for hoop-pass detection (ball crosses rim from above). */
    let prevBallY = s.y;

    function tick() {
      const el = containerRef.current;
      const ballEl = ballRef.current;
      const shadowEl = shadowRef.current;
      if (!el || !ballEl || !shadowEl) return;

      const W = el.clientWidth;
      const H = el.clientHeight;
      const R = BALL_RADIUS;
      const D = DEPTH;

      // --- Handle resize: proportionally reposition ball & clamp ---
      if (W !== prevW || H !== prevH) {
        if (prevW > 0 && prevH > 0) {
          s.x = (s.x / prevW) * W;
          s.y = (s.y / prevH) * H;
        }
        s.x = Math.max(R, Math.min(W - R, s.x));
        s.y = Math.max(R, Math.min(H - R, s.y));
        prevW = W;
        prevH = H;
      }

      const drag = dragRef.current;

      // --- Hoop position (recomputed so it tracks resizes) ---
      const hoopX = W - HOOP_RIGHT_OFFSET;
      const hoopY = HOOP_TOP_OFFSET;

      if (!drag.active) {
        // --- Gravity ---
        s.vy += GRAVITY;

        // --- Quadratic air drag (force proportional to v²) ---
        const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
        if (speed > 0.01) {
          const dragForce = AIR_DRAG * speed * speed / BALL_MASS;
          const dragScale = Math.max(0, 1 - dragForce / speed);
          s.vx *= dragScale;
          s.vy *= dragScale;
          s.vz *= dragScale;
        }

        // --- Terminal velocity clamp ---
        const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
        if (spd > TERMINAL_VELOCITY) {
          const scale = TERMINAL_VELOCITY / spd;
          s.vx *= scale;
          s.vy *= scale;
          s.vz *= scale;
        }

        s.x += s.vx;
        s.y += s.vy;
        s.z += s.vz;
      }

      // --- Spring-based squash/stretch deformation ---
      // Target squash is 1.0 (neutral); spring pulls toward it
      const squashForce = -(s.squash - 1) * DEFORM_SPRING;
      s.squashVel = (s.squashVel + squashForce) * DEFORM_DAMP;
      s.squash += s.squashVel;

      // Rotational inertia damping — reduces angular velocity each frame
      s.spin *= SPIN_DAMPING;
      // Clamp angular velocity to prevent uncontrollable flipping
      if (s.spin > MAX_SPIN) s.spin = MAX_SPIN;
      else if (s.spin < -MAX_SPIN) s.spin = -MAX_SPIN;
      s.angle += s.spin;

      const onGround = s.y + R >= H;

      // Extra rotational friction on ground contact — prevents jittery spinning on bounce
      if (onGround) {
        s.spin *= 0.85;
      }

      if (!drag.active) {
        // --- Boundary collisions with proper restitution ---
        // Left wall
        if (s.x - R < 0) {
          s.x = R;
          const impactV = Math.abs(s.vx);
          s.vx = impactV * COR_HORIZONTAL;
          s.spin += s.vy * 0.01; // wall imparts spin
          // Wall impact deformation — horizontal squash
          const wallSquash = Math.min(impactV / 20, MAX_SQUASH * 0.6);
          s.squash = 1 - wallSquash;
          s.squashVel = wallSquash * 0.15;
        } else if (s.x + R > W) {
          s.x = W - R;
          const impactV = Math.abs(s.vx);
          s.vx = -impactV * COR_HORIZONTAL;
          s.spin -= s.vy * 0.01;
          const wallSquash = Math.min(impactV / 20, MAX_SQUASH * 0.6);
          s.squash = 1 - wallSquash;
          s.squashVel = wallSquash * 0.15;
        }
        // Ceiling
        if (s.y - R < 0) {
          s.y = R;
          s.vy = Math.abs(s.vy) * COR_VERTICAL;
          const impactV = Math.abs(s.vy);
          const ceilSquash = Math.min(impactV / 16, MAX_SQUASH * 0.5);
          s.squash = 1 + ceilSquash; // stretch vertically on ceiling hit
          s.squashVel = -ceilSquash * 0.15;
        }
        // Floor — most complex: friction + deformation
        if (s.y + R > H) {
          s.y = H - R;
          const impactSpeed = Math.abs(s.vy);
          s.vy = -impactSpeed * COR_VERTICAL;

          // Ground friction: sliding + rolling
          s.vx *= GROUND_FRICTION;
          s.vz *= GROUND_FRICTION;

          // Rolling friction when slow
          if (Math.abs(s.vx) < 4) s.vx *= ROLLING_FRICTION;
          if (Math.abs(s.vz) < 4) s.vz *= ROLLING_FRICTION;

          // Spin from ground contact
          s.spin += s.vx * 0.015;

          // Impact deformation — proportional to impact speed
          const squashAmount = Math.min(impactSpeed / 14, MAX_SQUASH);
          s.squash = 1 - squashAmount;
          // Give squashVel a kick so it overshoots (wobble effect)
          s.squashVel = squashAmount * 0.2;

          // Kill tiny bounces (prevents infinite micro-bouncing)
          if (impactSpeed < 1.5) {
            s.vy = 0;
          }
        }
        // Depth walls
        if (s.z - R < 0) {
          s.z = R;
          s.vz = Math.abs(s.vz) * COR_HORIZONTAL;
        } else if (s.z + R > D) {
          s.z = D - R;
          s.vz = -Math.abs(s.vz) * COR_HORIZONTAL;
        }

        // --- Rim collision (two posts at rim edges) ---
        const rimLeft = hoopX - RIM_RADIUS;
        const rimRight = hoopX + RIM_RADIUS;
        for (const rimEdge of [rimLeft, rimRight]) {
          const dx = s.x - rimEdge;
          const dy = s.y - hoopY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = R + RIM_THICKNESS / 2;
          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            s.x = rimEdge + nx * minDist;
            s.y = hoopY + ny * minDist;
            const dot = s.vx * nx + s.vy * ny;
            s.vx -= 2 * dot * nx * 0.55;
            s.vy -= 2 * dot * ny * 0.55;
            // Rim hit deformation
            const rimImpact = Math.abs(dot);
            s.squash = 1 - Math.min(rimImpact / 18, MAX_SQUASH * 0.4);
            s.squashVel = Math.min(rimImpact / 18, MAX_SQUASH * 0.4) * 0.15;
            s.spin += (s.vx * ny - s.vy * nx) * 0.01;
          }
        }

        // --- Backboard collision ---
        const bbX = hoopX + RIM_RADIUS + BACKBOARD_W / 2 + 2;
        const bbTop = hoopY - BACKBOARD_H / 2;
        const bbBottom = hoopY + BACKBOARD_H / 2;
        if (
          s.x + R > bbX - BACKBOARD_W / 2 &&
          s.x - R < bbX + BACKBOARD_W / 2 &&
          s.y + R > bbTop &&
          s.y - R < bbBottom
        ) {
          s.x = bbX - BACKBOARD_W / 2 - R;
          const impactV = Math.abs(s.vx);
          s.vx = -impactV * 0.45;
          s.squash = 1 - Math.min(impactV / 20, MAX_SQUASH * 0.5);
          s.squashVel = Math.min(impactV / 20, MAX_SQUASH * 0.5) * 0.15;
        }

        // --- Score detection: ball center passes through rim from above ---
        const inRimX = Math.abs(s.x - hoopX) < RIM_RADIUS - 4;
        const crossedRim = prevBallY < hoopY && s.y >= hoopY;
        if (inRimX && crossedRim && s.vy > 0 && !scoredRef.current) {
          scoredRef.current = true;
          scoreFlashRef.current = 40;
          setScore((prev) => prev + 1);
        }
        if (!inRimX || s.y > hoopY + R * 2) {
          scoredRef.current = false;
        }

        // --- Keep lively ---
        const curSpeed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
        if (onGround && curSpeed < 2.5) {
          s.restFrames++;
        } else {
          s.restFrames = 0;
        }
        if (s.restFrames > REST_FRAMES_KICK) {
          s.vx += (Math.random() - 0.5) * 5;
          s.vy = -(7 + Math.random() * 5);
          s.vz += (Math.random() - 0.5) * 4;
          s.restFrames = 0;
        }
      }

      prevBallY = s.y;

      // --- 3D projection ---
      const depthScale = 0.6 + 0.4 * (s.z / D);
      const size = 50 * depthScale;

      // Spring-based squash already in s.squash; add velocity-based stretch when airborne
      let sq = s.squash;
      if (!onGround && s.vy < -4 && sq >= 0.97) {
        const stretch = Math.min(Math.abs(s.vy) / 22, MAX_STRETCH);
        sq = 1 + stretch;
      }
      // Volume preservation: scaleX * scaleY ≈ 1
      const scaleY = sq;
      const scaleX = 1 / sq;

      ballEl.style.width = `${size}px`;
      ballEl.style.height = `${size}px`;
      ballEl.style.left = `${s.x - size / 2}px`;
      ballEl.style.top = `${s.y - size / 2}px`;
      ballEl.style.opacity = String(0.6 + 0.4 * depthScale);
      ballEl.style.filter = `blur(${((1 - depthScale) * 1.5).toFixed(1)}px)`;
      ballEl.style.transform = `scaleX(${scaleX.toFixed(3)}) scaleY(${scaleY.toFixed(3)}) rotate(${(s.angle * 180 / Math.PI).toFixed(1)}deg)`;
      ballEl.style.transformOrigin = "center bottom";
      ballEl.style.cursor = drag.active ? "grabbing" : "grab";

      // Shadow
      const shadowY = H - 5;
      const shadowW = size * 1.3 * (1 - ((H - s.y) / H) * 0.5);
      const shadowH = shadowW * 0.3;
      shadowEl.style.width = `${shadowW}px`;
      shadowEl.style.height = `${shadowH}px`;
      shadowEl.style.left = `${s.x - shadowW / 2}px`;
      shadowEl.style.top = `${shadowY - shadowH / 2}px`;
      shadowEl.style.opacity = (0.5 * (1 - ((H - s.y) / H) * 0.7)).toFixed(2);

      // Hoop position
      const hoopEl = hoopRef.current;
      if (hoopEl) {
        hoopEl.style.left = `${hoopX - RIM_RADIUS - RIM_THICKNESS}px`;
        hoopEl.style.top = `${hoopY - BACKBOARD_H / 2}px`;
      }

      // Net flash on score
      const flashEl = netFlashRef.current;
      if (flashEl) {
        if (scoreFlashRef.current > 0) {
          scoreFlashRef.current--;
          const t = scoreFlashRef.current / 40;
          flashEl.style.opacity = (t * 0.7).toFixed(2);
          flashEl.style.transform = `scale(${1 + (1 - t) * 0.3})`;
        } else {
          flashEl.style.opacity = "0";
        }
      }

      // Trail
      const trails = trailsRef.current;
      const trailEls = trailElsRef.current;
      if (frameRef.current % 3 === 0) {
        const idx = trailIdxRef.current % TRAIL_COUNT;
        trails[idx] = { x: s.x, y: s.y, size: size * 0.4, life: 1 };
        trailIdxRef.current++;
      }
      for (let i = 0; i < trails.length; i++) {
        const t = trails[i];
        const tel = trailEls[i];
        if (!tel || t.life <= 0) {
          if (tel) tel.style.opacity = "0";
          continue;
        }
        t.life -= 0.04;
        const tSize = t.size * t.life;
        tel.style.width = `${tSize}px`;
        tel.style.height = `${tSize}px`;
        tel.style.left = `${t.x - tSize / 2}px`;
        tel.style.top = `${t.y - tSize / 2}px`;
        tel.style.opacity = (t.life * 0.4).toFixed(2);
      }

      frameRef.current++;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (!visible) return null;

  const hoopTotalW = RIM_RADIUS * 2 + RIM_THICKNESS * 2 + BACKBOARD_W + 4;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 50, perspective: "900px", pointerEvents: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Floor grid */}
      <div
        className="absolute left-0 pointer-events-none"
        style={{
          width: "100%",
          height: "60%",
          bottom: "-10%",
          transform: "rotateX(65deg)",
          transformOrigin: "bottom center",
          backgroundImage:
            "linear-gradient(rgba(100,100,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100,100,255,0.08) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Trail dots */}
      {Array.from({ length: TRAIL_COUNT }, (_, i) => (
        <div
          key={i}
          ref={setTrailRef(i)}
          className="absolute rounded-full pointer-events-none"
          style={{
            background: "rgba(214,51,132,0.3)",
            opacity: 0,
          }}
        />
      ))}

      {/* Shadow */}
      <div
        ref={shadowRef}
        className="absolute rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)",
          filter: "blur(4px)",
        }}
      />

      {/* Basketball hoop */}
      <div
        ref={hoopRef}
        className="absolute pointer-events-none"
        style={{ width: hoopTotalW, height: BACKBOARD_H }}
      >
        {/* Backboard */}
        <div
          className="absolute"
          style={{
            right: 0,
            top: 0,
            width: BACKBOARD_W,
            height: BACKBOARD_H,
            background: "linear-gradient(180deg, rgba(255,255,255,0.7), rgba(200,200,200,0.5))",
            borderRadius: 2,
            boxShadow: "1px 1px 4px rgba(0,0,0,0.3)",
          }}
        />
        {/* Rim (top-down ellipse) */}
        <div
          className="absolute"
          style={{
            left: RIM_THICKNESS,
            top: BACKBOARD_H / 2 - RIM_THICKNESS / 2,
            width: RIM_RADIUS * 2,
            height: RIM_THICKNESS * 2 + 2,
            border: `${RIM_THICKNESS}px solid #e84a20`,
            borderRadius: "50%",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            background: "transparent",
          }}
        />
        {/* Net (simple dashed lines) */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: RIM_THICKNESS,
            top: BACKBOARD_H / 2 + RIM_THICKNESS + 2,
          }}
          width={RIM_RADIUS * 2}
          height={36}
          viewBox={`0 0 ${RIM_RADIUS * 2} 36`}
        >
          {/* Net strings — three draped arcs */}
          {[0.15, 0.35, 0.5, 0.65, 0.85].map((frac, i) => {
            const x = frac * RIM_RADIUS * 2;
            const wobble = [1.2, -0.8, 1.5, -1.1, 0.6][i];
            return (
              <path
                key={i}
                d={`M${x},0 Q${x + wobble},18 ${x},36`}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="1.2"
                fill="none"
              />
            );
          })}
          {/* Horizontal rings */}
          {[10, 22].map((cy, i) => (
            <ellipse
              key={i}
              cx={RIM_RADIUS}
              cy={cy}
              rx={RIM_RADIUS * (1 - cy / 60)}
              ry={2}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
              fill="none"
            />
          ))}
        </svg>
        {/* Score flash (white ring that expands on basket) */}
        <div
          ref={netFlashRef}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: RIM_THICKNESS - 4,
            top: BACKBOARD_H / 2 - RIM_THICKNESS - 4,
            width: RIM_RADIUS * 2 + 8,
            height: RIM_THICKNESS * 2 + 10,
            border: "2px solid rgba(255,200,50,0.7)",
            borderRadius: "50%",
            opacity: 0,
          }}
        />
      </div>

      {/* Score counter */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          right: HOOP_RIGHT_OFFSET + RIM_RADIUS + 20,
          top: 12,
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "rgba(255,200,50,0.85)",
          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
        }}
      >
        {score > 0 && `${score}`}
      </div>

      {/* Ball — pointer-events-auto so it can be grabbed */}
      <div
        ref={ballRef}
        className="absolute rounded-full"
        style={{
          width: 50,
          height: 50,
          pointerEvents: "auto",
          cursor: "grab",
          touchAction: "none",
          background:
            "radial-gradient(circle at 35% 30%, #ff6baf, #d63384 40%, #8b1a5a 100%)",
          boxShadow:
            "inset -6px -6px 14px rgba(0,0,0,0.4), inset 4px 4px 10px rgba(255,255,255,0.2), 0 0 20px rgba(214,51,132,0.4)",
        }}
      />

      {/* Dismiss button */}
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 text-[10px] text-muted hover:text-txt pointer-events-auto rounded px-1.5 py-0.5 bg-bg/60 backdrop-blur-sm border border-border/30 transition-colors"
      >
        hide ball
      </button>
    </div>
  );
}
