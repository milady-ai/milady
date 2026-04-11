import type { Plugin } from "@elizaos/core";
import { manageProductsAction } from "./actions/manage-products.js";
import { manageInventoryAction } from "./actions/manage-inventory.js";
import { manageOrdersAction } from "./actions/manage-orders.js";
import { manageCustomersAction } from "./actions/manage-customers.js";
import { searchStoreAction } from "./actions/search-store.js";
import { storeContextProvider } from "./providers/store-context.js";
import { ShopifyService } from "./services/ShopifyService.js";

const shopifyPlugin: Plugin = {
  name: "shopify",
  description: "Manage Shopify stores -- products, orders, inventory, customers",
  actions: [
    manageProductsAction,
    manageInventoryAction,
    manageOrdersAction,
    manageCustomersAction,
    searchStoreAction,
  ],
  providers: [storeContextProvider],
  services: [ShopifyService],
};

export default shopifyPlugin;
export { ShopifyService };
export type { ShopifyPluginConfig } from "./types.js";
