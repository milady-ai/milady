const canvas = document.querySelector("#caveCanvas");
const loadedAt = document.querySelector("#loadedAt");
const viewportSize = document.querySelector("#viewportSize");
const canvasState = document.querySelector("#canvasState");

const ctx = canvas.getContext("2d", { alpha: false });
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const pointer = { x: 0.54, y: 0.44 };
let width = 0;
let height = 0;
let deviceScale = 1;
let animationFrame = 0;

const particles = Array.from({ length: 58 }, (_, index) => ({
  x: (index * 137.5) % 1000,
  y: (index * 71.3) % 1000,
  speed: 0.12 + (index % 7) * 0.035,
  size: 0.7 + (index % 5) * 0.34,
  hue: index % 4,
}));

function resize() {
  const rect = canvas.getBoundingClientRect();
  deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, Math.floor(rect.width));
  height = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(width * deviceScale);
  canvas.height = Math.floor(height * deviceScale);
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  updateTelemetry();
  draw(performance.now());
}

function updateTelemetry() {
  loadedAt.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  viewportSize.textContent = `${window.innerWidth} x ${window.innerHeight}`;
}

function drawCaveWall(top, time) {
  ctx.beginPath();
  if (top) {
    ctx.moveTo(0, 0);
    for (let x = 0; x <= width + 40; x += 38) {
      const wobble = Math.sin(x * 0.018 + time * 0.0004) * 26;
      const drop = height * (0.18 + ((x / 83) % 0.21)) + wobble;
      ctx.lineTo(x, drop);
    }
    ctx.lineTo(width, 0);
  } else {
    ctx.moveTo(0, height);
    for (let x = 0; x <= width + 40; x += 42) {
      const wobble = Math.cos(x * 0.014 + time * 0.00036) * 30;
      const rise = height * (0.77 - ((x / 97) % 0.18)) + wobble;
      ctx.lineTo(x, rise);
    }
    ctx.lineTo(width, height);
  }
  ctx.closePath();
  ctx.fillStyle = top ? "#07070b" : "#08080d";
  ctx.fill();
}

function drawNeonRibbon(time) {
  const yBase = height * (0.62 + (pointer.y - 0.5) * 0.08);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(39, 247, 255, 0.95)");
  gradient.addColorStop(0.36, "rgba(255, 62, 202, 0.95)");
  gradient.addColorStop(0.68, "rgba(186, 255, 93, 0.92)");
  gradient.addColorStop(1, "rgba(255, 211, 106, 0.92)");

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let pass = 0; pass < 3; pass += 1) {
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 22) {
      const wave =
        Math.sin(x * 0.012 + time * 0.0012) * 20 +
        Math.sin(x * 0.027 - time * 0.0008) * 9;
      const y = yBase + wave + pass * 18;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = pass === 0 ? gradient : `rgba(255, 255, 255, ${0.1 - pass * 0.025})`;
    ctx.lineWidth = pass === 0 ? 4.5 : 10 + pass * 8;
    ctx.shadowColor = pass === 0 ? "rgba(39, 247, 255, 0.86)" : "rgba(255, 62, 202, 0.18)";
    ctx.shadowBlur = pass === 0 ? 28 : 38;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRibs(time) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const progress = i / 17;
    const x = progress * width;
    const top = height * (0.2 + Math.sin(i * 1.7 + time * 0.0005) * 0.035);
    const bottom = height * (0.78 + Math.cos(i * 1.4 + time * 0.0004) * 0.04);
    const alpha = 0.08 + Math.sin(time * 0.001 + i) * 0.025;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(
      width * (0.5 + (pointer.x - 0.5) * 0.12),
      height * 0.48,
      x + Math.sin(i) * 28,
      bottom,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(time) {
  const colors = [
    "rgba(39, 247, 255, 0.86)",
    "rgba(255, 62, 202, 0.78)",
    "rgba(186, 255, 93, 0.72)",
    "rgba(255, 211, 106, 0.68)",
  ];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    const x = ((particle.x + time * particle.speed) % 1000) / 1000;
    const y = ((particle.y + time * particle.speed * 0.42) % 1000) / 1000;
    const px = x * width;
    const py = height * (0.18 + y * 0.62);
    ctx.fillStyle = colors[particle.hue];
    ctx.shadowColor = colors[particle.hue];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw(time) {
  ctx.fillStyle = "#050407";
  ctx.fillRect(0, 0, width, height);

  const floor = ctx.createLinearGradient(0, 0, 0, height);
  floor.addColorStop(0, "#08070d");
  floor.addColorStop(0.48, "#10101a");
  floor.addColorStop(1, "#050407");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width, height);

  drawRibs(time);
  drawNeonRibbon(time);
  drawParticles(time);
  drawCaveWall(true, time);
  drawCaveWall(false, time);

  ctx.fillStyle = "rgba(5, 4, 7, 0.16)";
  ctx.fillRect(0, 0, width, height);

  if (!prefersReducedMotion.matches) {
    animationFrame = requestAnimationFrame(draw);
  }
}

function onPointerMove(event) {
  pointer.x = event.clientX / Math.max(1, window.innerWidth);
  pointer.y = event.clientY / Math.max(1, window.innerHeight);
}

window.addEventListener("resize", resize, { passive: true });
window.addEventListener("pointermove", onPointerMove, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(animationFrame);
  } else if (!prefersReducedMotion.matches) {
    animationFrame = requestAnimationFrame(draw);
  }
});

resize();
if (prefersReducedMotion.matches) {
  canvasState.textContent = "Ready, still";
} else {
  canvasState.textContent = "Ready, animated";
}
