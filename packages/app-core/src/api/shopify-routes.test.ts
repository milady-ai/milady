/**
 * Route-level tests for shopify-routes.ts.
 *
 * Coverage:
 *   1. GET /api/shopify/status — no creds → { connected: false }
 *   2. GET /api/shopify/status — creds set, Shopify OK → { connected: true, shop }
 *   3. GET /api/shopify/status — creds set, Shopify throws → { connected: false }
 *   4. GET /api/shopify/products — no creds → 404
 *   5. GET /api/shopify/products — creds set → paginated product list
 *   6. POST /api/shopify/products — missing title → 400
 *   7. POST /api/shopify/products — valid body → 201 with product
 *   8. GET /api/shopify/orders — returns order list
 *   9. GET /api/shopify/inventory — returns items + locations
 *  10. POST /api/shopify/inventory/:id/adjust — delta=0 → 400
 *  11. POST /api/shopify/inventory/:id/adjust — valid delta → 200 ok
 *  12. GET /api/shopify/customers — returns customer list
 *  13. Unknown pathname → returns false (not handled)
 *  14. Shopify GraphQL error → 500
 */

import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// We intercept global fetch to avoid real HTTP calls
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ── Import under test (after mocks) ──────────────────────────────────────

import { handleShopifyRoute } from "./shopify-routes";

// ── Helpers ───────────────────────────────────────────────────────────────

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
}

function fakeReq(
  method: string,
  url: string,
  body?: string,
): http.IncomingMessage {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const req = {
    method,
    url,
    headers: { host: "127.0.0.1:31337" },
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
  } as unknown as http.IncomingMessage;

  queueMicrotask(() => {
    if (body !== undefined) {
      for (const cb of listeners.data ?? []) cb(Buffer.from(body));
    }
    for (const cb of listeners.end ?? []) cb();
  });

  return req;
}

function fakeRes(): { res: http.ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = {
    statusCode: 200,
    headers: {},
    body: "",
    headersSent: false,
  };
  const res = {
    get statusCode() {
      return captured.statusCode;
    },
    set statusCode(v: number) {
      captured.statusCode = v;
    },
    get headersSent() {
      return captured.headersSent;
    },
    setHeader(name: string, value: unknown) {
      captured.headers[name.toLowerCase()] = String(value);
    },
    end(data?: string | Buffer) {
      if (data !== undefined) captured.body = String(data);
      captured.headersSent = true;
    },
  } as unknown as http.ServerResponse;
  return { res, captured };
}

/** Build a minimal Shopify GraphQL success response */
function shopifyOk(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a Shopify GraphQL error response */
function shopifyErr(message: string): Response {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  delete process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_ACCESS_TOKEN;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("handleShopifyRoute", () => {
  // 1. Status — no creds
  it("GET /api/shopify/status returns connected:false when creds are missing", async () => {
    const req = fakeReq("GET", "/api/shopify/status");
    const { res, captured } = fakeRes();

    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/status",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.connected).toBe(false);
    expect(body.shop).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 2. Status — creds OK
  it("GET /api/shopify/status returns connected:true with shop info", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        shop: {
          name: "Test Store",
          myshopifyDomain: "test.myshopify.com",
          email: "owner@test.com",
          currencyCode: "USD",
          plan: { displayName: "Basic" },
          primaryDomain: { url: "https://test.myshopify.com" },
        },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/status");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/status",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.connected).toBe(true);
    expect(body.shop.name).toBe("Test Store");
    expect(body.shop.domain).toBe("test.myshopify.com");
    expect(body.shop.currencyCode).toBe("USD");
  });

  // 3. Status — Shopify throws
  it("GET /api/shopify/status returns connected:false when Shopify API errors", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(shopifyErr("Internal error"));

    const req = fakeReq("GET", "/api/shopify/status");
    const { res, captured } = fakeRes();
    await handleShopifyRoute(req, res, "/api/shopify/status", "GET");

    const body = JSON.parse(captured.body);
    expect(body.connected).toBe(false);
  });

  // 4. Products — no creds → 404
  it("GET /api/shopify/products returns 404 when not configured", async () => {
    const req = fakeReq("GET", "/api/shopify/products?page=1&limit=20&q=");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(404);
  });

  // 5. Products — list
  it("GET /api/shopify/products returns paginated product list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        products: {
          edges: [
            {
              node: {
                id: "gid://shopify/Product/1",
                title: "Widget",
                status: "ACTIVE",
                productType: "Widgets",
                vendor: "Acme",
                totalInventory: 10,
                updatedAt: "2026-01-01T00:00:00Z",
                featuredImage: null,
                priceRangeV2: {
                  minVariantPrice: { amount: "9.99" },
                  maxVariantPrice: { amount: "9.99" },
                },
              },
            },
          ],
          pageInfo: { hasNextPage: false },
        },
        productsCount: { count: 1 },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/products?page=1&limit=20&q=");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.total).toBe(1);
    expect(body.products).toHaveLength(1);
    expect(body.products[0].title).toBe("Widget");
    expect(body.products[0].imageUrl).toBeNull();
  });

  // 6. Create product — missing title
  it("POST /api/shopify/products returns 400 when title is missing", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const req = fakeReq(
      "POST",
      "/api/shopify/products",
      JSON.stringify({ vendor: "Acme" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "POST",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    const body = JSON.parse(captured.body);
    expect(body.error).toMatch(/title/i);
  });

  // 7. Create product — happy path
  it("POST /api/shopify/products creates a product and returns 201", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        productCreate: {
          product: {
            id: "gid://shopify/Product/99",
            title: "New Widget",
            status: "DRAFT",
            productType: "",
            vendor: "Acme",
            totalInventory: 0,
            updatedAt: "2026-01-01T00:00:00Z",
            featuredImage: null,
          },
          userErrors: [],
        },
      }),
    );

    const req = fakeReq(
      "POST",
      "/api/shopify/products",
      JSON.stringify({ title: "New Widget", vendor: "Acme" }),
    );
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/products",
      "POST",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(201);
    const body = JSON.parse(captured.body);
    expect(body.title).toBe("New Widget");
    expect(body.status).toBe("DRAFT");
  });

  // 8. Orders
  it("GET /api/shopify/orders returns order list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        orders: {
          edges: [
            {
              node: {
                id: "gid://shopify/Order/1001",
                name: "#1001",
                email: "customer@example.com",
                createdAt: "2026-01-01T00:00:00Z",
                displayFinancialStatus: "PAID",
                displayFulfillmentStatus: "UNFULFILLED",
                totalPriceSet: {
                  shopMoney: { amount: "29.99", currencyCode: "USD" },
                },
                lineItems: { edges: [{ node: { id: "x" } }] },
              },
            },
          ],
        },
        ordersCount: { count: 1 },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/orders?status=any&limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/orders",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.total).toBe(1);
    expect(body.orders[0].name).toBe("#1001");
    expect(body.orders[0].totalPrice).toBe("29.99");
    expect(body.orders[0].financialStatus).toBe("PAID");
  });

  // 9. Inventory
  it("GET /api/shopify/inventory returns items and locations", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        products: {
          edges: [
            {
              node: {
                title: "Widget",
                variants: {
                  edges: [
                    {
                      node: {
                        id: "gid://shopify/ProductVariant/1",
                        title: "Default Title",
                        sku: "WGT-001",
                        inventoryItem: {
                          id: "gid://shopify/InventoryItem/1",
                          inventoryLevels: {
                            edges: [
                              {
                                node: {
                                  available: 5,
                                  location: { name: "Main Warehouse" },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        locations: {
          edges: [{ node: { name: "Main Warehouse", isActive: true } }],
        },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/inventory");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/inventory",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.locations).toContain("Main Warehouse");
    expect(body.items).toHaveLength(1);
    expect(body.items[0].available).toBe(5);
    expect(body.items[0].variantTitle).toBe(""); // "Default Title" is normalized to ""
  });

  // 10. Inventory adjust — delta=0 rejected
  it("POST /api/shopify/inventory/:id/adjust rejects delta=0", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const pathname =
      "/api/shopify/inventory/gid://shopify/InventoryItem/1/adjust";
    const req = fakeReq("POST", pathname, JSON.stringify({ delta: 0 }));
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(req, res, pathname, "POST");

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(400);
    const body = JSON.parse(captured.body);
    expect(body.error).toMatch(/delta/i);
  });

  // 11. Inventory adjust — happy path
  it("POST /api/shopify/inventory/:id/adjust adjusts stock and returns ok", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const itemId = "gid://shopify/InventoryItem/1";

    // First call: resolve location
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryItem: {
          id: itemId,
          inventoryLevels: {
            edges: [
              {
                node: {
                  id: "gid://shopify/InventoryLevel/1",
                  location: {
                    id: "gid://shopify/Location/1",
                    name: "Main Warehouse",
                  },
                },
              },
            ],
          },
        },
      }),
    );

    // Second call: the adjust mutation
    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        inventoryAdjustQuantities: {
          inventoryAdjustmentGroup: { reason: "correction" },
          userErrors: [],
        },
      }),
    );

    const pathname = `/api/shopify/inventory/${itemId}/adjust`;
    const req = fakeReq("POST", pathname, JSON.stringify({ delta: 3 }));
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(req, res, pathname, "POST");

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 12. Customers
  it("GET /api/shopify/customers returns customer list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(
      shopifyOk({
        customers: {
          edges: [
            {
              node: {
                id: "gid://shopify/Customer/1",
                firstName: "Jane",
                lastName: "Doe",
                email: "jane@example.com",
                ordersCount: 3,
                totalSpentV2: { amount: "150.00", currencyCode: "USD" },
                createdAt: "2026-01-01T00:00:00Z",
              },
            },
          ],
        },
        customersCount: { count: 1 },
      }),
    );

    const req = fakeReq("GET", "/api/shopify/customers?limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/customers",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(200);
    const body = JSON.parse(captured.body);
    expect(body.total).toBe(1);
    expect(body.customers[0].firstName).toBe("Jane");
    expect(body.customers[0].totalSpent).toBe("150.00");
  });

  // 13. Unknown pathname — not handled
  it("returns false for unrecognised pathnames", async () => {
    // Creds must be set so the dispatcher reaches the route-match logic;
    // without them it short-circuits at the 404 "not configured" guard.
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    const req = fakeReq("GET", "/api/shopify/unknown");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/unknown",
      "GET",
    );

    expect(handled).toBe(false);
    expect(captured.headersSent).toBe(false);
  });

  // 14. Shopify GraphQL error → 500
  it("returns 500 when Shopify returns a GraphQL error on a data route", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test.myshopify.com";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

    fetchMock.mockResolvedValueOnce(shopifyErr("Access denied"));

    const req = fakeReq("GET", "/api/shopify/orders?status=any&limit=20");
    const { res, captured } = fakeRes();
    const handled = await handleShopifyRoute(
      req,
      res,
      "/api/shopify/orders",
      "GET",
    );

    expect(handled).toBe(true);
    expect(captured.statusCode).toBe(500);
    const body = JSON.parse(captured.body);
    expect(body.error).toMatch(/Access denied/);
  });
});
