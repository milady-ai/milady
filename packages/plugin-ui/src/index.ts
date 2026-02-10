/**
 * @elizaos/plugin-ui — Public SDK for plugin configuration UI.
 *
 * Provides:
 *  - ConfigRenderer: Schema-driven form component
 *  - Field renderers: 23 built-in field type renderers
 *  - Catalog utilities: defineCatalog, defineRegistry, resolveFields
 *  - Data binding: getByPath, setByPath, resolveDynamic, findFormValue
 *  - Visibility: evaluateVisibility, evaluateShowIf, evaluateLogicExpression
 *  - Validation: runValidation, builtInValidators, check helpers
 *  - Actions: ActionDefinition, ActionHandler types
 *  - Type definitions: FieldRenderProps, ConfigUiHint, JsonSchemaObject, etc.
 *
 * @example
 * ```tsx
 * import { ConfigRenderer, defaultRegistry } from "@elizaos/plugin-ui";
 * import type { FieldRenderProps } from "@elizaos/plugin-ui";
 *
 * <ConfigRenderer
 *   schema={mySchema}
 *   hints={myHints}
 *   values={configValues}
 *   registry={defaultRegistry}
 *   onChange={handleChange}
 * />
 * ```
 *
 * @module @elizaos/plugin-ui
 */

// ── Catalog & Registry ──────────────────────────────────────────────────
export {
  // Factory functions
  defineCatalog,
  defineRegistry,
  resolveFields,

  // Data binding utilities
  getByPath,
  setByPath,
  resolveDynamic,
  findFormValue,
  interpolateString,

  // Rich visibility utilities
  evaluateVisibility,
  evaluateLogicExpression,
  evaluateShowIf,
  visibility,

  // Validation utilities
  runValidation,
  builtInValidators,
  check,

  // Defaults
  defaultCatalog,
} from "@app/components/config-catalog";

export type {
  // Core types
  FieldRenderProps,
  FieldRenderer,
  FieldDefinition,
  FieldCatalog,
  FieldRegistry,
  ResolvedField,
  JsonSchemaObject,
  JsonSchemaProperty,
  CatalogConfig,

  // Action types
  ActionDefinition,
  ActionHandler,
  ValidationFunction,
} from "@app/components/config-catalog";

// ── Field Renderers ─────────────────────────────────────────────────────
export {
  defaultRenderers,
  ConfigField,
} from "@app/components/config-field";

// ── ConfigRenderer ──────────────────────────────────────────────────────
export {
  ConfigRenderer,
  defaultRegistry,
  useConfigValidation,
} from "@app/components/config-renderer";

export type {
  ConfigRendererProps,
  ConfigRendererHandle,
} from "@app/components/config-renderer";

// ── Types ───────────────────────────────────────────────────────────────
export {
  DEFAULT_PLUGIN_UI_THEME,
} from "@app/types";

export type {
  ConfigUiHint,
  ConfigUiHints,
  ShowIfCondition,
  VisibilityCondition,
  LogicExpression,
  DynamicValue,
  ValidationCheck,
  ValidationConfig,
  ActionBinding,
  PluginUiTheme,
} from "@app/types";

// ── Plugin-specific types ───────────────────────────────────────────────
// Re-export from the existing SDK barrel file in apps/app
export {
  createFieldType,
  adaptRenderer,
  extendRegistry,
} from "@app/components/plugin-ui";

export type {
  PluginConfigFieldProps,
  PluginFieldRenderer,
  PluginConfigPageProps,
} from "@app/components/plugin-ui";

// ── Zod re-export for field type definitions ────────────────────────────
export { z } from "zod";
