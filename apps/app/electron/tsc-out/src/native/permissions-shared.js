"use strict";
/**
 * Shared permission types and registry for Electron main-process code.
 *
 * This keeps Electron's TypeScript program self-contained under
 * apps/app/electron to avoid cross-root imports during compilation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PERMISSIONS = void 0;
exports.isPermissionApplicable = isPermissionApplicable;
exports.SYSTEM_PERMISSIONS = [
  {
    id: "accessibility",
    name: "Accessibility",
    description:
      "Control mouse, keyboard, and interact with other applications",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"],
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    description: "Capture screen content for screenshots and vision",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"],
  },
  {
    id: "microphone",
    name: "Microphone",
    description: "Voice input for talk mode and speech recognition",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"],
  },
  {
    id: "camera",
    name: "Camera",
    description: "Video input for vision and video capture",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"],
  },
  {
    id: "shell",
    name: "Shell Access",
    description: "Execute terminal commands and scripts",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"],
  },
];
const PERMISSION_MAP = new Map(
  exports.SYSTEM_PERMISSIONS.map((permission) => [permission.id, permission]),
);
function isPermissionApplicable(id, platform) {
  const definition = PERMISSION_MAP.get(id);
  return definition ? definition.platforms.includes(platform) : false;
}
