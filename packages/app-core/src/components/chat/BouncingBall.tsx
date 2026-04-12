/**
 * 3D bouncing ball overlay for the chat window.
 *
 * Renders a CSS-based 3D ball that bounces within its parent container
 * boundaries using requestAnimationFrame physics. Includes a perspective
 * floor grid, shadow, and fading trail dots.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const BALL_RADIUS = 25;
const GRAVITY = 0.35;
const DAMPING = 0.82;
const FRICTION = 0.995;
const TRAIL_COUNT = 12;
const DEPTH = 400;

interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
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

  const ballRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const trailElsRef = useRef<(HTMLDivElement | null)[]>([]);

  const setTrailRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      trailElsRef.current[index] = el;
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    const ball = ballRef.current;
    const shadow = shadowRef.current;
    if (!container || !ball || !shadow) return;

    const s = stateRef.current;
    // Initialize position to container center
    const rect = container.getBoundingClientRect();
    s.x = rect.width / 2;
    s.y = rect.height / 3;

    function tick() {
      const el = containerRef.current;
      const ballEl = ballRef.current;
      const shadowEl = shadowRef.current;
      if (!el || !ballEl || !shadowEl) return;

      const W = el.clientWidth;
      const H = el.clientHeight;
      const R = BALL_RADIUS;
      const D = DEPTH;

      // Physics
      s.vy += GRAVITY;
      s.vx *= FRICTION;
      s.vz *= FRICTION;

      s.x += s.vx;
      s.y += s.vy;
      s.z += s.vz;

      // Boundary collisions
      if (s.x - R < 0) {
        s.x = R;
        s.vx = Math.abs(s.vx) * DAMPING;
      }
      if (s.x + R > W) {
        s.x = W - R;
        s.vx = -Math.abs(s.vx) * DAMPING;
      }
      if (s.y - R < 0) {
        s.y = R;
        s.vy = Math.abs(s.vy) * DAMPING;
      }
      if (s.y + R > H) {
        s.y = H - R;
        s.vy = -Math.abs(s.vy) * DAMPING;
        if (Math.abs(s.vy) < 1.5) {
          s.vx += (Math.random() - 0.5) * 2;
          s.vz += (Math.random() - 0.5) * 2;
          s.vy = -Math.abs(s.vy) - 2;
        }
      }
      if (s.z - R < 0) {
        s.z = R;
        s.vz = Math.abs(s.vz) * DAMPING;
      }
      if (s.z + R > D) {
        s.z = D - R;
        s.vz = -Math.abs(s.vz) * DAMPING;
      }

      // Keep lively
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
      if (speed < 2) {
        s.vx += (Math.random() - 0.5) * 6;
        s.vy -= 6 + Math.random() * 4;
        s.vz += (Math.random() - 0.5) * 6;
      }

      // 3D projection
      const depthScale = 0.6 + 0.4 * (s.z / D);
      const size = 50 * depthScale;

      ballEl.style.width = `${size}px`;
      ballEl.style.height = `${size}px`;
      ballEl.style.left = `${s.x - size / 2}px`;
      ballEl.style.top = `${s.y - size / 2}px`;
      ballEl.style.opacity = String(0.6 + 0.4 * depthScale);
      ballEl.style.filter = `blur(${((1 - depthScale) * 1.5).toFixed(1)}px)`;

      // Shadow
      const shadowY = H - 5;
      const shadowW = size * 1.3 * (1 - ((H - s.y) / H) * 0.5);
      const shadowH = shadowW * 0.3;
      shadowEl.style.width = `${shadowW}px`;
      shadowEl.style.height = `${shadowH}px`;
      shadowEl.style.left = `${s.x - shadowW / 2}px`;
      shadowEl.style.top = `${shadowY - shadowH / 2}px`;
      shadowEl.style.opacity = (0.5 * (1 - ((H - s.y) / H) * 0.7)).toFixed(2);

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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 50, perspective: "900px" }}
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

      {/* Ball */}
      <div
        ref={ballRef}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 50,
          height: 50,
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
