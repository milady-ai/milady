import type {
  Action,
  ActionExample,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { logger, ModelType, parseJSONObjectFromText } from "@elizaos/core";
import type { InventoryLevel, Location } from "../types.js";
import { SHOPIFY_SERVICE_TYPE, ShopifyService } from "../services/ShopifyService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasShopifyConfig(runtime: IAgentRuntime): boolean {
  const domain = runtime.getSetting("SHOPIFY_STORE_DOMAIN");
  const token = runtime.getSetting("SHOPIFY_ACCESS_TOKEN");
  return typeof domain === "string" && domain.trim().length > 0
    && typeof token === "string" && token.trim().length > 0;
}

function formatInventoryLevel(level: InventoryLevel): string {
  const qty = level.available !== null ? String(level.available) : "untracked";
  return `- ${level.location.name}: ${qty} available`;
}

function formatLocation(loc: Location): string {
  return `- ${loc.name} (${loc.isActive ? "active" : "inactive"})`;
}

type InventoryIntent =
  | { action: "check"; productQuery: string }
  | { action: "adjust"; productQuery: string; delta: number; reason: string | null }
  | { action: "locations" };

async function classifyIntent(
  runtime: IAgentRuntime,
  text: string,
): Promise<InventoryIntent | null> {
  const prompt = `Analyze the user message and determine what inventory action they want.
Return a JSON object with one of these shapes:
- { "action": "check", "productQuery": "product name or SKU to check" }
- { "action": "adjust", "productQuery": "product name", "delta": 5, "reason": "reason or null" }
  (delta is positive to add stock, negative to remove stock)
- { "action": "locations" }

User message: "${text}"

Return ONLY the JSON object.`;

  for (let i = 0; i < 2; i++) {
    const response = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    const parsed = parseJSONObjectFromText(response);
    if (parsed?.action) {
      return parsed as unknown as InventoryIntent;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const examples: ActionExample[][] = [
  [
    {
      name: "user",
      content: { text: "Check inventory for 'Summer Hat'" },
    },
    {
      name: "assistant",
      content: {
        text: "Here are the inventory levels for Summer Hat:",
      },
    },
  ],
  [
    {
      name: "user",
      content: { text: "Add 50 units of stock for the blue t-shirt" },
    },
    {
      name: "assistant",
      content: {
        text: "I've adjusted the inventory for Blue T-Shirt by +50.",
      },
    },
  ],
];

export const manageInventoryAction: Action = {
  name: "MANAGE_SHOPIFY_INVENTORY",
  similes: ["CHECK_INVENTORY", "ADJUST_INVENTORY", "CHECK_STOCK", "UPDATE_STOCK"],
  description:
    "Check inventory levels, adjust stock quantities, and list store locations in Shopify.",

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    return hasShopifyConfig(runtime);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const svc = runtime.getService<ShopifyService>(SHOPIFY_SERVICE_TYPE);
    if (!svc?.isConnected()) {
      await callback?.({ text: "Shopify is not connected. Please check SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN." });
      return { success: false, error: "Shopify not connected" };
    }

    const text = typeof message.content?.text === "string" ? message.content.text : "";
    const intent = await classifyIntent(runtime, text);

    if (!intent) {
      await callback?.({ text: "I couldn't determine what inventory action you want. Try: check stock, adjust inventory, or list locations." });
      return { success: false, error: "Could not classify intent" };
    }

    try {
      if (intent.action === "locations") {
        const locations = await svc.listLocations();
        if (locations.length === 0) {
          await callback?.({ text: "No locations found in the store." });
          return { success: true, text: "No locations" };
        }
        await callback?.({
          text: `Store locations:\n\n${locations.map(formatLocation).join("\n")}`,
        });
        return { success: true, data: { locations } };
      }

      if (intent.action === "check") {
        // Find product and its first variant's inventory item
        const result = await svc.listProducts({ query: intent.productQuery, first: 3 });
        if (result.products.length === 0) {
          await callback?.({ text: `No product found matching "${intent.productQuery}".` });
          return { success: false, error: "Product not found" };
        }

        const product = result.products[0];
        const firstVariant = product.variants.edges[0]?.node;
        if (!firstVariant) {
          await callback?.({ text: `Product "${product.title}" has no variants.` });
          return { success: false, error: "No variants" };
        }

        // The inventoryItem GID is derived from the variant's ID.
        // Shopify variant IDs look like gid://shopify/ProductVariant/123
        // The inventory item ID is gid://shopify/InventoryItem/123
        const variantNumericId = firstVariant.id.split("/").pop();
        const inventoryItemId = `gid://shopify/InventoryItem/${variantNumericId}`;

        const levels = await svc.checkInventory(inventoryItemId);
        if (levels.length === 0) {
          await callback?.({ text: `No inventory tracking found for "${product.title}".` });
          return { success: true, text: "No inventory tracking" };
        }

        await callback?.({
          text: `Inventory for **${product.title}** (${firstVariant.title}):\n\n${levels.map(formatInventoryLevel).join("\n")}`,
        });
        return { success: true, data: { product: product.title, levels } };
      }

      if (intent.action === "adjust") {
        // Find the product
        const result = await svc.listProducts({ query: intent.productQuery, first: 3 });
        if (result.products.length === 0) {
          await callback?.({ text: `No product found matching "${intent.productQuery}".` });
          return { success: false, error: "Product not found" };
        }

        const product = result.products[0];
        const firstVariant = product.variants.edges[0]?.node;
        if (!firstVariant) {
          await callback?.({ text: `Product "${product.title}" has no variants.` });
          return { success: false, error: "No variants" };
        }

        const variantNumericId = firstVariant.id.split("/").pop();
        const inventoryItemId = `gid://shopify/InventoryItem/${variantNumericId}`;

        // Get current levels to find a location
        const levels = await svc.checkInventory(inventoryItemId);
        if (levels.length === 0) {
          // Try to get a location from the store
          const locations = await svc.listLocations();
          if (locations.length === 0) {
            await callback?.({ text: "No locations found in the store to adjust inventory against." });
            return { success: false, error: "No locations" };
          }
          await svc.adjustInventory({
            inventoryItemId,
            locationId: locations[0].id,
            delta: intent.delta,
            reason: intent.reason ?? "correction",
          });
        } else {
          await svc.adjustInventory({
            inventoryItemId,
            locationId: levels[0].location.id,
            delta: intent.delta,
            reason: intent.reason ?? "correction",
          });
        }

        const sign = intent.delta >= 0 ? "+" : "";
        await callback?.({
          text: `Inventory adjusted for **${product.title}**: ${sign}${intent.delta} units.`,
        });
        return { success: true, data: { product: product.title, delta: intent.delta } };
      }

      await callback?.({ text: "Unsupported inventory action." });
      return { success: false, error: "Unknown action" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ src: "plugin:shopify:manage-inventory", error: msg }, "Inventory action failed");
      await callback?.({ text: `Shopify inventory operation failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples,
};
