import type {
  LifeOpsReminderStep,
  LifeOpsTimeWindowDefinition,
  LifeOpsWindowPolicy,
} from "@miladyai/shared/contracts/lifeops";

export const DEFAULT_TIME_WINDOWS: LifeOpsTimeWindowDefinition[] = [
  {
    name: "morning",
    label: "Morning",
    startMinute: 5 * 60,
    endMinute: 12 * 60,
  },
  {
    name: "afternoon",
    label: "Afternoon",
    startMinute: 12 * 60,
    endMinute: 17 * 60,
  },
  {
    name: "evening",
    label: "Evening",
    startMinute: 17 * 60,
    endMinute: 22 * 60,
  },
  {
    name: "night",
    label: "Night",
    startMinute: 22 * 60,
    endMinute: 28 * 60,
  },
];

export const DEFAULT_REMINDER_STEPS: LifeOpsReminderStep[] = [
  {
    channel: "in_app",
    offsetMinutes: 0,
    label: "In-app reminder",
  },
];

export function resolveDefaultTimeZone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved && resolved.trim().length > 0 ? resolved : "UTC";
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timeZone?: string | null): string {
  const candidate = typeof timeZone === "string" ? timeZone.trim() : "";
  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }
  return resolveDefaultTimeZone();
}

export function resolveDefaultWindowPolicy(timeZone?: string | null): LifeOpsWindowPolicy {
  const timezone = normalizeTimeZone(timeZone);
  return {
    timezone,
    windows: DEFAULT_TIME_WINDOWS.map((window) => ({ ...window })),
  };
}

export function normalizeWindowPolicy(
  policy: LifeOpsWindowPolicy | null | undefined,
  timeZone?: string | null,
): LifeOpsWindowPolicy {
  const fallback = resolveDefaultWindowPolicy(timeZone);
  if (!policy) return fallback;
  const timezone = normalizeTimeZone(policy.timezone || timeZone || fallback.timezone);
  const windows = Array.isArray(policy.windows)
    ? policy.windows
        .map((window) => {
          const name = window?.name ?? "custom";
          const label =
            typeof window?.label === "string" && window.label.trim().length > 0
              ? window.label.trim()
              : name;
          const startMinute = Number(window?.startMinute);
          const endMinute = Number(window?.endMinute);
          if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) {
            return null;
          }
          if (endMinute <= startMinute) {
            return null;
          }
          return {
            name,
            label,
            startMinute,
            endMinute,
          } satisfies LifeOpsTimeWindowDefinition;
        })
        .filter((window): window is LifeOpsTimeWindowDefinition => window !== null)
    : [];
  if (windows.length === 0) {
    return fallback;
  }
  return {
    timezone,
    windows,
  };
}
