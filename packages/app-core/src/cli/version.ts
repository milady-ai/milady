import { resolveElizaVersion } from "@miladyai/agent/version-resolver";

export const CLI_VERSION = resolveElizaVersion(import.meta.url);
