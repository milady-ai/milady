/**
 * macOS Permission Detection — Electrobun
 *
 * Adapted from the Electron version.
 * Removed: desktopCapturer, systemPreferences, shell (all Electron APIs).
 * Screen recording checked via osascript; mic/camera via osascript TCC queries.
 * openPrivacySettings uses exec('open ...') instead of shell.openExternal.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

const execAsync = promisify(exec);

export async function checkAccessibility(): Promise<PermissionCheckResult> {
  const script = `tell application "System Events"\nreturn (exists process 1)\nend tell`;
  const { stdout, stderr } = await execAsync(`osascript -e '${script}'`, {
    timeout: 5000,
  }).catch((err) => ({ stdout: "", stderr: String(err.message || "failed") }));

  if (
    stderr &&
    (stderr.includes("not allowed") || stderr.includes("assistive"))
  ) {
    return { status: "denied", canRequest: false };
  }
  if (stdout.trim() === "true") return { status: "granted", canRequest: false };
  return { status: "denied", canRequest: false };
}

export async function checkScreenRecording(): Promise<PermissionCheckResult> {
  // Use osascript to attempt a screen capture — if denied, it throws
  const { stderr } = await execAsync(
    `osascript -e 'tell application "System Events" to get name of windows of application processes'`,
    { timeout: 5000 },
  ).catch((err) => ({ stdout: "", stderr: String(err.message || "failed") }));

  if (
    stderr &&
    (stderr.includes("not authorized") || stderr.includes("denied"))
  ) {
    return { status: "denied", canRequest: false };
  }
  return { status: "not-determined", canRequest: false };
}

export async function checkMicrophone(): Promise<PermissionCheckResult> {
  const { stdout } = await execAsync(
    `osascript -e 'use framework "AVFoundation"
set auth to (current application)'''s AVCaptureDevice'''s authorizationStatusForMediaType:((current application)'''s AVMediaTypeAudio)
return auth as integer'`,
    { timeout: 5000 },
  ).catch(() => ({ stdout: "-1" }));
  const code = parseInt(stdout.trim(), 10);
  // 0=not-determined, 1=restricted, 2=denied, 3=authorized
  if (code === 3) return { status: "granted", canRequest: false };
  if (code === 0) return { status: "not-determined", canRequest: true };
  if (code === 2) return { status: "denied", canRequest: false };
  return { status: "not-determined", canRequest: true };
}

export async function checkCamera(): Promise<PermissionCheckResult> {
  const { stdout } = await execAsync(
    `osascript -e 'use framework "AVFoundation"
set auth to (current application)'''s AVCaptureDevice'''s authorizationStatusForMediaType:((current application)'''s AVMediaTypeVideo)
return auth as integer'`,
    { timeout: 5000 },
  ).catch(() => ({ stdout: "-1" }));
  const code = parseInt(stdout.trim(), 10);
  if (code === 3) return { status: "granted", canRequest: false };
  if (code === 0) return { status: "not-determined", canRequest: true };
  if (code === 2) return { status: "denied", canRequest: false };
  return { status: "not-determined", canRequest: true };
}

export async function requestMicrophone(): Promise<PermissionCheckResult> {
  // Trigger permission prompt via AppleScript — best-effort in Electrobun context
  await execAsync(
    `osascript -e 'tell application "System Events" to get microphone permission'`,
  ).catch(() => {});
  return checkMicrophone();
}

export async function requestCamera(): Promise<PermissionCheckResult> {
  await execAsync(
    `osascript -e 'tell application "System Events" to get camera permission'`,
  ).catch(() => {});
  return checkCamera();
}

export async function openPrivacySettings(
  permission: SystemPermissionId,
): Promise<void> {
  const paneUrls: Record<string, string> = {
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording":
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    shell:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  };
  const url = paneUrls[permission];
  if (url) {
    await execAsync(`open '${url}'`).catch(() => {});
  }
}

export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility":
      return checkAccessibility();
    case "screen-recording":
      return checkScreenRecording();
    case "microphone":
      return checkMicrophone();
    case "camera":
      return checkCamera();
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
      return requestMicrophone();
    case "camera":
      return requestCamera();
    case "accessibility":
    case "screen-recording":
      await openPrivacySettings(id);
      await new Promise((r) => setTimeout(r, 500));
      return checkPermission(id);
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
