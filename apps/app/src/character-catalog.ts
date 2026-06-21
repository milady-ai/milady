import type { CharacterCatalogData } from "@elizaos/ui";
import {
  buildElizaCharacterCatalog,
  setDefaultAgentName,
} from "@elizaos/shared";
import { APP_CONFIG } from "./app-config";

// Rebrand the default agent ("eliza") to this app's name (e.g. "Milady") before
// the catalog is built. This drives the onboarding default name, the character
// the user talks to (config.name written at first-run), and the picker default.
// A name of "Eliza" is a no-op, so this is safe to call for any app.
setDefaultAgentName(APP_CONFIG.appName);

export const APP_CHARACTER_CATALOG: CharacterCatalogData =
  buildElizaCharacterCatalog() as CharacterCatalogData;
