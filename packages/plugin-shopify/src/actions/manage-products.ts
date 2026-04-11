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
import type { Product } from "../types.js";
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

function formatProduct(p: Product): string {
  const variants = p.variants.edges.map((e) => e.node);
  const priceRange = variants.length > 0
    ? variants.map((v) => v.price).join(", ")
    : "n/a";
  const inventory = p.totalInventory !== null ? String(p.totalInventory) : "untracked";
  return `- **${p.title}** (${p.status}) | Price: ${priceRange} | Inventory: ${inventory} | Handle: ${p.handle}`;
}

type ProductIntent =
  | { action: "list"; query: string | null }
  | { action: "create"; title: string; description: string | null; productType: string | null; vendor: string | null; status: string | null }
  | { action: "update"; identifier: string; title: string | null; description: string | null; status: string | null };

async function classifyIntent(
  runtime: IAgentRuntime,
  text: string,
): Promise<ProductIntent | null> {
  const prompt = `Analyze the user message and determine what product action they want.
Return a JSON object with one of these shapes:
- { "action": "list", "query": "search term or null" }
- { "action": "create", "title": "product title", "description": "description or null", "productType": "type or null", "vendor": "vendor or null", "status": "ACTIVE or DRAFT or null" }
- { "action": "update", "identifier": "product title or handle to find", "title": "new title or null", "description": "new description or null", "status": "ACTIVE or DRAFT or ARCHIVED or null" }

User message: "${text}"

Return ONLY the JSON object.`;

  for (let i = 0; i < 2; i++) {
    const response = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
    const parsed = parseJSONObjectFromText(response);
    if (parsed?.action) {
      return parsed as unknown as ProductIntent;
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
      content: { text: "Show me all products in the Shopify store" },
    },
    {
      name: "assistant",
      content: {
        text: "Here are the products currently in the store:",
      },
    },
  ],
  [
    {
      name: "user",
      content: { text: "Create a new product called 'Summer Hat' priced at 29.99" },
    },
    {
      name: "assistant",
      content: {
        text: "I've created the product 'Summer Hat' as a draft.",
      },
    },
  ],
];

export const manageProductsAction: Action = {
  name: "MANAGE_SHOPIFY_PRODUCTS",
  similes: ["LIST_PRODUCTS", "CREATE_PRODUCT", "UPDATE_PRODUCT", "SEARCH_PRODUCTS"],
  description:
    "List, search, create, or update products in a connected Shopify store.",

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
      await callback?.({ text: "I couldn't determine what product action you want. You can ask me to list, create, or update products." });
      return { success: false, error: "Could not classify intent" };
    }

    try {
      if (intent.action === "list") {
        const result = await svc.listProducts({ query: intent.query, first: 10 });
        if (result.products.length === 0) {
          await callback?.({ text: intent.query ? `No products found matching "${intent.query}".` : "The store has no products yet." });
          return { success: true, text: "No products found" };
        }
        const lines = result.products.map(formatProduct);
        const more = result.hasNextPage ? "\n\n(More products available -- ask to see more)" : "";
        await callback?.({
          text: `Found ${result.products.length} product(s):\n\n${lines.join("\n")}${more}`,
        });
        return { success: true, data: { products: result.products } };
      }

      if (intent.action === "create") {
        const product = await svc.createProduct({
          title: intent.title,
          descriptionHtml: intent.description ?? undefined,
          productType: intent.productType ?? undefined,
          vendor: intent.vendor ?? undefined,
          status: intent.status ?? "DRAFT",
        });
        await callback?.({
          text: `Product created:\n\n${formatProduct(product)}`,
        });
        return { success: true, data: { product } };
      }

      if (intent.action === "update") {
        // Find the product first
        const searchResult = await svc.listProducts({ query: intent.identifier, first: 5 });
        if (searchResult.products.length === 0) {
          await callback?.({ text: `Could not find a product matching "${intent.identifier}".` });
          return { success: false, error: "Product not found" };
        }
        const target = searchResult.products[0];
        const updateInput: Record<string, string | undefined> = {};
        if (intent.title) updateInput.title = intent.title;
        if (intent.description) updateInput.descriptionHtml = intent.description;
        if (intent.status) updateInput.status = intent.status.toUpperCase();

        const updated = await svc.updateProduct(target.id, updateInput);
        await callback?.({
          text: `Product updated:\n\n${formatProduct(updated)}`,
        });
        return { success: true, data: { product: updated } };
      }

      await callback?.({ text: "Unsupported product action." });
      return { success: false, error: "Unknown action" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ src: "plugin:shopify:manage-products", error: msg }, "Product action failed");
      await callback?.({ text: `Shopify product operation failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples,
};
