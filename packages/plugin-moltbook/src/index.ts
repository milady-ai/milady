import { moltbookPlugin } from "./plugin.ts";

export { moltbookOnboardAction } from "./actions/onboard.ts";
export { moltbookApiRequestAction } from "./actions/request.ts";
export type { MoltbookConfig } from "./config.ts";
export { loadMoltbookConfig, moltbookConfigSchema } from "./config.ts";
export { moltbookPlugin } from "./plugin.ts";
export { moltbookStatusProvider } from "./providers/status.ts";
export { moltbookRoutes } from "./routes.ts";
export type {
  MoltbookApiRequestInput,
  MoltbookApiResult,
  MoltbookOnboardInput,
  MoltbookOnboardResult,
  MoltbookStatus,
} from "./services/moltbook-service.ts";
export { MoltbookService } from "./services/moltbook-service.ts";

export default moltbookPlugin;
