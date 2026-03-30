import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
  getAuditFeedSize,
  queryAuditFeed,
  subscribeAuditFeed,
} from "@miladyai/agent";
import {
  type DiagnosticsRouteContext as AutonomousDiagnosticsRouteContext,
  handleDiagnosticsRoutes as handleAutonomousDiagnosticsRoutes,
} from "@miladyai/agent/api/diagnostics-routes";

type DiagnosticsRouteContext = Omit<
  AutonomousDiagnosticsRouteContext,
  | "auditEventTypes"
  | "auditSeverities"
  | "getAuditFeedSize"
  | "queryAuditFeed"
  | "subscribeAuditFeed"
>;

function defaultResolveExtensionPath(): string | null {
  try {
    const serverDir = path.dirname(fileURLToPath(import.meta.url));
    const extensionPath = path.resolve(
      serverDir,
      "..",
      "..",
      "apps",
      "chrome-extension",
    );
    return fs.existsSync(extensionPath) ? extensionPath : null;
  } catch {
    return null;
  }
}

export async function handleDiagnosticsRoutes(
  ctx: DiagnosticsRouteContext,
): Promise<boolean> {
  return handleAutonomousDiagnosticsRoutes({
    ...ctx,
    resolveExtensionPath:
      ctx.resolveExtensionPath ?? defaultResolveExtensionPath,
    auditEventTypes: AUDIT_EVENT_TYPES,
    auditSeverities: AUDIT_SEVERITIES,
    getAuditFeedSize,
    queryAuditFeed: (query) => queryAuditFeed(query as never) as never,
    subscribeAuditFeed,
  });
}
