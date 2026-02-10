/**
 * Type-only exports for @elizaos/plugin-ui.
 * Import from "@elizaos/plugin-ui/types" for zero-runtime type usage.
 */

// ── Catalog types ───────────────────────────────────────────────────────
export type {
  FieldRenderProps,
  FieldRenderer,
  FieldDefinition,
  FieldCatalog,
  FieldRegistry,
  ResolvedField,
  JsonSchemaObject,
  JsonSchemaProperty,
  CatalogConfig,
  ActionDefinition,
  ActionHandler,
  ValidationFunction,
} from "@app/components/config-catalog";

// ── ConfigRenderer types ────────────────────────────────────────────────
export type {
  ConfigRendererProps,
  ConfigRendererHandle,
} from "@app/components/config-renderer";

// ── Plugin SDK types ────────────────────────────────────────────────────
export type {
  PluginConfigFieldProps,
  PluginFieldRenderer,
  PluginConfigPageProps,
} from "@app/components/plugin-ui";

// ── Core UI types ───────────────────────────────────────────────────────
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
