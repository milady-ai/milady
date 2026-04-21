/**
 * HTTP routes backing the Shopify overlay app (/api/shopify/*).
 *
 * Uses SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN from the environment
 * (same credentials as @elizaos/plugin-shopify).
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import { sendJson, sendJsonError } from "./response";

const API_VERSION = "2025-04";

const PRODUCT_FIELDS = `
  id
  title
  status
  productType
  vendor
  totalInventory
  updatedAt
  featuredImage { url }
  variants(first: 20) {
    edges { node { price } }
  }
`;

const ORDER_FIELDS = `
  id
  name
  email
  createdAt
  displayFinancialStatus
  displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  lineItems(first: 50) {
    edges { node { id } }
  }
`;

type ProductsPageInfoSlice = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

class ShopifyGraphqlClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(storeDomain: string, accessToken: string) {
    const domain = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.baseUrl = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
    this.accessToken = accessToken;
  }

  async query<T>(
    graphql: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const resp = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query: graphql, variables }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(
        `Shopify API error: ${resp.status} ${resp.statusText}${body ? ` -- ${body.slice(0, 200)}` : ""}`,
      );
    }

    const json = (await resp.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `Shopify GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`,
      );
    }

    return json.data as T;
  }
}

function getShopifyCredentials(): { domain: string; token: string } | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (!domain || !token) return null;
  return { domain, token };
}

function parseSearch(req: http.IncomingMessage): URLSearchParams {
  const raw = req.url ?? "/";
  const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
  return new URLSearchParams(q);
}

function mapProductStatus(
  raw: string,
): "ACTIVE" | "DRAFT" | "ARCHIVED" {
  const u = raw.toUpperCase();
  if (u === "ACTIVE" || u === "DRAFT" || u === "ARCHIVED") return u;
  return "DRAFT";
}

function mapFinancialStatus(
  raw: string | null,
): "PAID" | "PENDING" | "REFUNDED" | "PARTIALLY_REFUNDED" {
  if (!raw) return "PENDING";
  const u = raw.replace(/\s+/g, "_").toUpperCase();
  if (u.includes("REFUND") && u.includes("PART")) return "PARTIALLY_REFUNDED";
  if (u.includes("REFUND")) return "REFUNDED";
  if (u.includes("PAID") || u === "AUTHORIZED") return "PAID";
  return "PENDING";
}

function mapFulfillmentStatus(
  raw: string | null,
): "FULFILLED" | "UNFULFILLED" | "PARTIALLY_FULFILLED" | null {
  if (!raw) return null;
  const u = raw.replace(/\s+/g, "_").toUpperCase();
  if (u.includes("PART")) return "PARTIALLY_FULFILLED";
  if (u.includes("FULFILL") && !u.includes("UN") && !u.includes("PART"))
    return "FULFILLED";
  if (u.includes("UNFULFILL") || u === "UNFULFILLED") return "UNFULFILLED";
  return null;
}

function splitCustomerName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const t = displayName.trim();
  if (!t) return { firstName: "", lastName: "" };
  const sp = t.indexOf(" ");
  if (sp === -1) return { firstName: t, lastName: "" };
  return { firstName: t.slice(0, sp), lastName: t.slice(sp + 1).trim() };
}

function buildOrderSearchQuery(statusFilter: string): string | null {
  if (statusFilter === "unfulfilled") return "fulfillment_status:unfulfilled";
  if (statusFilter === "fulfilled") return "fulfillment_status:fulfilled";
  return null;
}

export async function handleShopifyRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (method !== "GET") {
    sendJsonError(res, 405, "Method not allowed");
    return true;
  }

  const creds = getShopifyCredentials();

  // Status is allowed without credentials — UI treats this as disconnected.
  if (pathname === "/api/shopify/status") {
    if (!creds) {
      sendJson(res, 200, { connected: false, shop: null });
      return true;
    }
    try {
      const client = new ShopifyGraphqlClient(creds.domain, creds.token);
      const data = await client.query<{
        shop: {
          name: string;
          email: string;
          myshopifyDomain: string;
          plan: { displayName: string };
          currencyCode: string;
        };
      }>(`{
        shop {
          name
          email
          myshopifyDomain
          plan { displayName }
          currencyCode
        }
      }`);
      sendJson(res, 200, {
        connected: true,
        shop: {
          name: data.shop.name,
          domain: data.shop.myshopifyDomain,
          plan: data.shop.plan.displayName,
          email: data.shop.email,
          currencyCode: data.shop.currencyCode,
        },
      });
    } catch (err) {
      logger.warn(
        `[shopify] /status failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      sendJson(res, 200, { connected: false, shop: null });
    }
    return true;
  }

  if (!creds) {
    sendJsonError(
      res,
      503,
      "Shopify is not configured (set SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN)",
    );
    return true;
  }

  const client = new ShopifyGraphqlClient(creds.domain, creds.token);
  const params = parseSearch(req);

  try {
    if (pathname === "/api/shopify/products") {
      const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20),
      );
      const q = (params.get("q") ?? "").trim();
      const searchQuery = q ? q : null;

      const countData = await client.query<{
        productsCount: { count: number };
      }>(
        searchQuery
          ? `query($q: String!) { productsCount(query: $q) { count } }`
          : `{ productsCount { count } }`,
        searchQuery ? { q: searchQuery } : undefined,
      );
      const total = countData.productsCount.count;

      let cursor: string | null = null;
      for (let p = 1; p < page; p++) {
        const gql = `query ListProducts($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query, sortKey: TITLE) {
            pageInfo { hasNextPage endCursor }
          }
        }`;
        const pageSlice = await client.query<ProductsPageInfoSlice>(gql, {
          first: pageSize,
          after: cursor,
          query: searchQuery,
        });
        if (!pageSlice.products.pageInfo.hasNextPage) {
          sendJson(res, 200, {
            products: [],
            total,
            page,
            pageSize,
          });
          return true;
        }
        cursor = pageSlice.products.pageInfo.endCursor;
      }

      const listGql = `query ListProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: TITLE) {
          edges { node { ${PRODUCT_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }`;
      const data = await client.query<{
        products: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              status: string;
              productType: string;
              vendor: string;
              totalInventory: number | null;
              updatedAt: string;
              featuredImage: { url: string } | null;
              variants: {
                edges: Array<{ node: { price: string } }>;
              };
            };
          }>;
        };
      }>(listGql, {
        first: pageSize,
        after: cursor,
        query: searchQuery,
      });

      const products = data.products.edges.map(({ node: n }) => {
        const prices = n.variants.edges.map((e) => parseFloat(e.node.price));
        const valid = prices.filter((p) => !Number.isNaN(p));
        const min =
          valid.length > 0 ? String(Math.min(...valid)) : "0";
        const max =
          valid.length > 0 ? String(Math.max(...valid)) : "0";
        return {
          id: n.id,
          title: n.title,
          status: mapProductStatus(n.status),
          productType: n.productType ?? "",
          vendor: n.vendor ?? "",
          totalInventory: n.totalInventory ?? 0,
          priceRange: { min, max },
          imageUrl: n.featuredImage?.url ?? null,
          updatedAt: n.updatedAt,
        };
      });

      sendJson(res, 200, {
        products,
        total,
        page,
        pageSize,
      });
      return true;
    }

    if (pathname === "/api/shopify/orders") {
      const limit = Math.min(
        50,
        Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20),
      );
      const statusFilter = params.get("status") ?? "any";
      const orderQuery = buildOrderSearchQuery(statusFilter);

      let countGql: string;
      let countVars: Record<string, unknown> | undefined;
      if (orderQuery) {
        countGql = `query($q: String!) { ordersCount(query: $q) { count } }`;
        countVars = { q: orderQuery };
      } else {
        countGql = `{ ordersCount { count } }`;
      }
      const countData = await client.query<{ ordersCount: { count: number } }>(
        countGql,
        countVars,
      );
      const total = countData.ordersCount.count;

      const listGql = `query ListOrders($first: Int!, $query: String) {
        orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges { node { ${ORDER_FIELDS} } }
        }
      }`;
      const data = await client.query<{
        orders: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              email: string | null;
              createdAt: string;
              displayFinancialStatus: string | null;
              displayFulfillmentStatus: string | null;
              totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
              lineItems: { edges: Array<{ node: { id: string } }> };
            };
          }>;
        };
      }>(listGql, {
        first: limit,
        query: orderQuery ?? "",
      });

      const orders = data.orders.edges.map(({ node: o }) => ({
        id: o.id,
        name: o.name,
        email: o.email ?? "",
        totalPrice: o.totalPriceSet.shopMoney.amount,
        currencyCode: o.totalPriceSet.shopMoney.currencyCode,
        fulfillmentStatus: mapFulfillmentStatus(o.displayFulfillmentStatus),
        financialStatus: mapFinancialStatus(o.displayFinancialStatus),
        createdAt: o.createdAt,
        lineItemCount: o.lineItems.edges.length,
      }));

      sendJson(res, 200, { orders, total });
      return true;
    }

    if (pathname === "/api/shopify/customers") {
      const limit = Math.min(
        50,
        Math.max(1, parseInt(params.get("limit") ?? "20", 10) || 20),
      );
      const q = (params.get("q") ?? "").trim();
      const searchQuery = q ? q : null;

      const countData = await client.query<{ customersCount: { count: number } }>(
        searchQuery
          ? `query($q: String!) { customersCount(query: $q) { count } }`
          : `{ customersCount { count } }`,
        searchQuery ? { q: searchQuery } : undefined,
      );
      const total = countData.customersCount.count;

      const gql = `query ListCustomers($first: Int!, $query: String) {
        customers(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              displayName
              email
              ordersCount
              totalSpentV2 { amount currencyCode }
              createdAt
            }
          }
        }
      }`;
      const data = await client.query<{
        customers: {
          edges: Array<{
            node: {
              id: string;
              displayName: string;
              email: string | null;
              ordersCount: string;
              totalSpentV2: { amount: string; currencyCode: string };
              createdAt: string;
            };
          }>;
        };
      }>(gql, { first: limit, query: searchQuery ?? "" });

      const customers = data.customers.edges.map(({ node: c }) => {
        const { firstName, lastName } = splitCustomerName(c.displayName);
        return {
          id: c.id,
          firstName,
          lastName,
          email: c.email ?? "",
          ordersCount: parseInt(c.ordersCount, 10) || 0,
          totalSpent: c.totalSpentV2.amount,
          currencyCode: c.totalSpentV2.currencyCode,
          createdAt: c.createdAt,
        };
      });

      sendJson(res, 200, { customers, total });
      return true;
    }

    if (pathname === "/api/shopify/inventory") {
      const gql = `query InventoryDashboard($first: Int!) {
        locations(first: 20) {
          edges { node { name } }
        }
        productVariants(first: $first) {
          edges {
            node {
              id
              title
              sku
              product { title }
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      quantities(names: ["available", "incoming"]) {
                        name
                        quantity
                      }
                      location { name }
                    }
                  }
                }
              }
            }
          }
        }
      }`;
      const data = await client.query<{
        locations: { edges: Array<{ node: { name: string } }> };
        productVariants: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              sku: string | null;
              product: { title: string };
              inventoryItem: {
                id: string;
                inventoryLevels: {
                  edges: Array<{
                    node: {
                      quantities: Array<{
                        name: string;
                        quantity: number;
                      }>;
                      location: { name: string };
                    };
                  }>;
                };
              } | null;
            };
          }>;
        };
      }>(gql, { first: 80 });

      const locNames = new Set<string>();
      for (const e of data.locations.edges) {
        locNames.add(e.node.name);
      }

      const items: Array<{
        id: string;
        sku: string;
        productTitle: string;
        variantTitle: string;
        locationName: string;
        available: number;
        incoming: number;
      }> = [];

      for (const { node: v } of data.productVariants.edges) {
        const levels = v.inventoryItem?.inventoryLevels.edges ?? [];
        for (const { node: lvl } of levels) {
          locNames.add(lvl.location.name);
          let available = 0;
          let incoming = 0;
          for (const q of lvl.quantities) {
            if (q.name === "available") available = q.quantity;
            if (q.name === "incoming") incoming = q.quantity;
          }
          items.push({
            id: `${v.id}:${lvl.location.name}`,
            sku: v.sku ?? "",
            productTitle: v.product.title,
            variantTitle: v.title,
            locationName: lvl.location.name,
            available,
            incoming,
          });
        }
      }

      sendJson(res, 200, {
        items,
        locations: [...locNames].sort(),
      });
      return true;
    }
  } catch (err) {
    logger.warn(
      `[shopify] ${pathname} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    sendJsonError(
      res,
      502,
      err instanceof Error ? err.message : "Shopify request failed",
    );
    return true;
  }

  return false;
}
