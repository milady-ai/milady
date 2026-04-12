import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function resolveStateDir(): string {
  return (
    process.env.MILADY_STATE_DIR?.trim() ||
    process.env.ELIZA_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".milady")
  );
}

export function resolveTelegramAccountSessionDir(): string {
  const sessionDir = path.join(resolveStateDir(), "telegram-account");
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

export function resolveTelegramAccountSessionFile(): string {
  return path.join(resolveTelegramAccountSessionDir(), "session.txt");
}

export function loadTelegramAccountSessionString(): string {
  const sessionFile = resolveTelegramAccountSessionFile();
  if (!fs.existsSync(sessionFile)) {
    return "";
  }
  const session = fs.readFileSync(sessionFile, "utf8").trim();
  return session;
}

export function saveTelegramAccountSessionString(session: string): void {
  const sessionFile = resolveTelegramAccountSessionFile();
  fs.writeFileSync(sessionFile, session, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function clearTelegramAccountSession(): void {
  const sessionFile = resolveTelegramAccountSessionFile();
  if (!fs.existsSync(sessionFile)) {
    return;
  }
  fs.rmSync(sessionFile, { force: true });
}
