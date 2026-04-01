/**
 * Canvas2D rendering functions for the 3D scene overlay panels.
 *
 * Each function paints a panel onto a provided CanvasRenderingContext2D
 * using the project's glassmorphism design language: dark translucent
 * backgrounds, gold accent borders, DM Sans / JetBrains Mono typography.
 */

// ── Design tokens ────────────────────────────────────────────────────
const GOLD = "#f0b90b";
const GOLD_BORDER = "rgba(240, 185, 11, 0.25)";
const GOLD_DIM = "rgba(240, 185, 11, 0.12)";
const BG_DARK = "rgba(10, 10, 12, 0.88)";
const BG_CARD = "rgba(18, 20, 26, 0.72)";
const TEXT_PRIMARY = "#eaecef";
const TEXT_SECONDARY = "rgba(234, 236, 239, 0.6)";
const TEXT_MUTED = "rgba(234, 236, 239, 0.38)";
const STATUS_GREEN = "#03a66d";
const STATUS_RED = "#f6465d";
const STATUS_YELLOW = "#f0b90b";
const STATUS_BLUE = "#1e88e5";

const FONT_SANS = '"DM Sans", "Inter", sans-serif';
const FONT_MONO = '"JetBrains Mono", "Fira Code", monospace';
const CORNER_RADIUS = 16;

// ── Shared types ─────────────────────────────────────────────────────

export interface ChatOverlayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentStatusOverlay {
  state: string;
  agentName: string;
  uptime?: number;
  sessions: Array<{
    sessionId: string;
    label: string;
    agentType: string;
  }>;
}

export interface TriggerOverlay {
  id: string;
  displayName: string;
  triggerType: string;
  enabled: boolean;
  lastStatus?: string;
  cronExpression?: string;
  intervalMs?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPanelBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  borderColor = GOLD_BORDER,
): void {
  // Outer glow
  ctx.save();
  ctx.shadowColor = "rgba(240, 185, 11, 0.08)";
  ctx.shadowBlur = 32;
  roundRect(ctx, 4, 4, w - 8, h - 8, CORNER_RADIUS);
  ctx.fillStyle = BG_DARK;
  ctx.fill();
  ctx.restore();

  // Border
  roundRect(ctx, 4, 4, w - 8, h - 8, CORNER_RADIUS);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner highlight line at top
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(4 + CORNER_RADIUS + 8, 6);
  ctx.lineTo(w - 4 - CORNER_RADIUS - 8, 6);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize = 24,
): void {
  ctx.font = `600 ${fontSize}px ${FONT_SANS}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(text, x, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawStatusDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 6,
): void {
  // Glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function formatUptime(ms: number | undefined): string {
  if (ms == null || ms <= 0) return "--";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatInterval(ms: number | undefined): string {
  if (!ms) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `every ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `every ${hours}h`;
}

function agentStateColor(state: string): string {
  switch (state) {
    case "running":
      return STATUS_GREEN;
    case "starting":
    case "restarting":
      return STATUS_YELLOW;
    case "error":
      return STATUS_RED;
    default:
      return TEXT_MUTED;
  }
}

function triggerStatusColor(status: string | undefined): string {
  switch (status) {
    case "success":
      return STATUS_GREEN;
    case "error":
      return STATUS_RED;
    case "skipped":
      return STATUS_YELLOW;
    default:
      return TEXT_MUTED;
  }
}

// ── Panel renderers ──────────────────────────────────────────────────

export function renderChatPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  messages: ChatOverlayMessage[],
): void {
  // No panel background — transparent canvas, bubbles float freely
  ctx.clearRect(0, 0, w, h);

  const pad = 10;
  const bubbleMaxWidth = w - pad * 2 - 12;
  const fontSize = 11;
  const lineHeight = fontSize * 1.35;
  const bubblePadX = 10;
  const bubblePadY = 6;
  const bubbleRadius = 10;
  const bubbleGap = 4;

  // Render messages bottom-aligned: start from the bottom and work up
  const visibleMessages = messages.slice(-10);
  if (visibleMessages.length === 0) return;

  // Pre-calculate all bubble heights to bottom-align
  const bubbleInfos: Array<{
    msg: ChatOverlayMessage;
    lines: string[];
    height: number;
  }> = [];
  for (const msg of visibleMessages) {
    ctx.font = `400 ${fontSize}px ${FONT_SANS}`;
    const truncatedText =
      msg.text.length > 200 ? `${msg.text.slice(0, 197)}...` : msg.text;
    const lines = wrapText(ctx, truncatedText, bubbleMaxWidth - bubblePadX * 2);
    const height = lines.length * lineHeight + bubblePadY * 2;
    bubbleInfos.push({ msg, lines, height });
  }

  // Start from the bottom of the canvas
  let y = h - pad;

  // Draw from last message upwards
  for (let i = bubbleInfos.length - 1; i >= 0; i--) {
    const { msg, lines, height } = bubbleInfos[i]!;
    const isUser = msg.role === "user";
    const bubbleWidth = Math.min(
      bubbleMaxWidth,
      Math.max(...lines.map((l) => ctx.measureText(l).width)) +
        bubblePadX * 2 +
        4,
    );

    y -= height;
    if (y < 0) break;

    // Position: user bubbles right-aligned, assistant left-aligned
    const bubbleX = isUser ? w - pad - bubbleWidth : pad;

    // Bubble background — matches the 2D companion chat style
    if (isUser) {
      // Gold-tinted user bubble with subtle border
      roundRect(ctx, bubbleX, y, bubbleWidth, height, bubbleRadius);
      // Gradient fill
      const grad = ctx.createLinearGradient(bubbleX, y, bubbleX, y + height);
      grad.addColorStop(0, "rgba(240, 185, 11, 0.16)");
      grad.addColorStop(1, "rgba(240, 185, 11, 0.06)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(240, 185, 11, 0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner top highlight
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.moveTo(bubbleX + bubbleRadius + 4, y + 1);
      ctx.lineTo(bubbleX + bubbleWidth - bubbleRadius - 4, y + 1);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else {
      // Gray assistant bubble — frosted card look
      roundRect(ctx, bubbleX, y, bubbleWidth, height, bubbleRadius);
      const grad = ctx.createLinearGradient(bubbleX, y, bubbleX, y + height);
      grad.addColorStop(0, "rgba(30, 33, 42, 0.88)");
      grad.addColorStop(1, "rgba(18, 20, 26, 0.92)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner top highlight
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.beginPath();
      ctx.moveTo(bubbleX + bubbleRadius + 4, y + 1);
      ctx.lineTo(bubbleX + bubbleWidth - bubbleRadius - 4, y + 1);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Text
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `400 ${fontSize}px ${FONT_SANS}`;
    let textY = y + bubblePadY + fontSize;
    for (const line of lines) {
      ctx.fillText(line, bubbleX + bubblePadX, textY);
      textY += lineHeight;
    }

    y -= bubbleGap;
  }
}

export function renderStatusPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  status: AgentStatusOverlay | null,
): void {
  ctx.clearRect(0, 0, w, h);

  const pad = 12;
  const fs = 12;
  const fsMono = 10;

  // Thin sci-fi border frame — angled corner cuts
  ctx.save();
  ctx.strokeStyle = "rgba(240, 185, 11, 0.18)";
  ctx.lineWidth = 1;
  const cx = 10; // corner cut size
  ctx.beginPath();
  ctx.moveTo(pad + cx, pad);
  ctx.lineTo(w - pad, pad);
  ctx.lineTo(w - pad, h - pad - cx);
  ctx.lineTo(w - pad - cx, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad, pad + cx);
  ctx.closePath();
  ctx.fillStyle = "rgba(6, 8, 14, 0.55)";
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Top accent line
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + cx, pad);
  ctx.lineTo(pad + cx + 50, pad);
  ctx.stroke();

  let y = pad + 16;

  // Header — small mono label
  ctx.font = `600 ${fsMono}px ${FONT_MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText("SYS:STATUS", pad + 8, y);
  y += 14;

  if (!status) {
    ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText("OFFLINE", pad + 8, y + 10);
    return;
  }

  const stateColor = agentStateColor(status.state);

  // State indicator line
  drawStatusDot(ctx, pad + 14, y + 5, stateColor, 3);
  ctx.font = `500 ${fs}px ${FONT_SANS}`;
  ctx.fillStyle = TEXT_PRIMARY;
  ctx.fillText(status.state.toUpperCase(), pad + 24, y + 9);

  // Uptime right-aligned
  ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_SECONDARY;
  const uptimeStr = formatUptime(status.uptime);
  const uptimeW = ctx.measureText(uptimeStr).width;
  ctx.fillText(uptimeStr, w - pad - uptimeW - 8, y + 9);
  y += 18;

  // Thin separator
  ctx.strokeStyle = "rgba(240, 185, 11, 0.08)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(pad + 8, y);
  ctx.lineTo(w - pad - 8, y);
  ctx.stroke();
  y += 8;

  // Agent name
  ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText((status.agentName || "agent").toUpperCase(), pad + 8, y + 8);
  y += 16;

  // Sessions
  if (status.sessions.length > 0) {
    for (const session of status.sessions.slice(0, 3)) {
      if (y > h - pad - 8) break;
      drawStatusDot(ctx, pad + 14, y + 5, STATUS_BLUE, 2.5);
      ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
      ctx.fillStyle = TEXT_SECONDARY;
      const label =
        session.label.length > 22
          ? `${session.label.slice(0, 19)}...`
          : session.label;
      ctx.fillText(label, pad + 22, y + 8);
      y += 14;
    }
  }
}

export function renderHeartbeatsPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  triggers: TriggerOverlay[],
): void {
  ctx.clearRect(0, 0, w, h);

  const pad = 12;
  const fsMono = 10;

  // Sci-fi border frame — matching status panel style
  ctx.save();
  ctx.strokeStyle = "rgba(240, 185, 11, 0.18)";
  ctx.lineWidth = 1;
  const cx = 10;
  ctx.beginPath();
  ctx.moveTo(pad + cx, pad);
  ctx.lineTo(w - pad, pad);
  ctx.lineTo(w - pad, h - pad - cx);
  ctx.lineTo(w - pad - cx, h - pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad, pad + cx);
  ctx.closePath();
  ctx.fillStyle = "rgba(6, 8, 14, 0.55)";
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Top accent line
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + cx, pad);
  ctx.lineTo(pad + cx + 50, pad);
  ctx.stroke();

  let y = pad + 16;

  // Header
  ctx.font = `600 ${fsMono}px ${FONT_MONO}`;
  ctx.fillStyle = GOLD;
  ctx.fillText("SYS:HEARTBEAT", pad + 8, y);
  y += 14;

  if (triggers.length === 0) {
    ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText("NO TRIGGERS", pad + 8, y + 8);
    return;
  }

  for (const trigger of triggers.slice(0, 6)) {
    if (y > h - pad - 8) break;

    // Status dot + name
    drawStatusDot(
      ctx,
      pad + 14,
      y + 5,
      trigger.enabled ? STATUS_GREEN : TEXT_MUTED,
      2.5,
    );

    ctx.font = `400 ${fsMono}px ${FONT_MONO}`;
    ctx.fillStyle = trigger.enabled ? TEXT_PRIMARY : TEXT_MUTED;
    const name =
      trigger.displayName.length > 18
        ? `${trigger.displayName.slice(0, 15)}...`
        : trigger.displayName;
    ctx.fillText(name, pad + 22, y + 8);

    // Schedule right-aligned
    const scheduleText =
      trigger.triggerType === "cron"
        ? (trigger.cronExpression ?? "cron")
        : trigger.triggerType === "interval"
          ? formatInterval(trigger.intervalMs)
          : "once";
    ctx.fillStyle = TEXT_MUTED;
    const schedW = ctx.measureText(scheduleText).width;
    ctx.fillText(scheduleText, w - pad - schedW - 8, y + 8);

    // Last status dot far right
    if (trigger.lastStatus) {
      drawStatusDot(
        ctx,
        w - pad - 4,
        y + 5,
        triggerStatusColor(trigger.lastStatus),
        2,
      );
    }

    y += 16;
  }
}
