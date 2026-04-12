import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleManagedClient,
  resolveManagedGoogleCloudConfig,
  type ManagedGoogleClientError,
} from "./google-managed-client";

describe("GoogleManagedClient", () => {
  let envBackup: Record<string, string | undefined>;

  beforeEach(() => {
    envBackup = {
      MILADY_CONFIG_PATH: process.env.MILADY_CONFIG_PATH,
      ELIZAOS_CLOUD_API_KEY: process.env.ELIZAOS_CLOUD_API_KEY,
      ELIZAOS_CLOUD_BASE_URL: process.env.ELIZAOS_CLOUD_BASE_URL,
    };
    delete process.env.MILADY_CONFIG_PATH;
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("surfaces plain-text upstream errors without reusing the response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream exploded", {
        status: 502,
        statusText: "Bad Gateway",
        headers: {
          "Content-Type": "text/plain",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus("owner")).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 502,
        message: "upstream exploded",
      }),
    );
  });

  it("prefers structured JSON error messages when present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "cloud rejected request" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus("owner")).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 401,
        message: "cloud rejected request",
      }),
    );
  });

  it("keeps HTML error responses concise", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Not found</body></html>", {
        status: 404,
        statusText: "Not Found",
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus("owner")).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 404,
        message: "404 Not Found",
      }),
    );
  });

  it("reads the cloud api key from milady.json when env is scrubbed", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "google-managed-client-"),
    );
    const configPath = path.join(tempDir, "milady.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        cloud: {
          apiKey: "ck-from-config",
          baseUrl: "https://cloud-from-config.example",
        },
      }),
      "utf8",
    );
    process.env.MILADY_CONFIG_PATH = configPath;

    const resolved = resolveManagedGoogleCloudConfig();

    expect(resolved).toMatchObject({
      configured: true,
      apiKey: "ck-from-config",
      apiBaseUrl: "https://cloud-from-config.example/api/v1",
      siteUrl: "https://cloud-from-config.example",
    });

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("raises a handled connector error when cloud is not configured", async () => {
    const client = new GoogleManagedClient({
      configured: false,
      apiKey: null,
      apiBaseUrl: "https://cloud.example/api/v1",
      siteUrl: "https://cloud.example",
    });

    await expect(client.getStatus("owner")).rejects.toEqual(
      expect.objectContaining<Partial<ManagedGoogleClientError>>({
        status: 409,
        message: "Eliza Cloud is not connected.",
      }),
    );
  });

  it("calls the managed Gmail search endpoint with the encoded query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [], syncedAt: "2026-04-10T00:00:00.000Z" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example/api/v1",
      siteUrl: "https://cloud.example",
    });

    await client.getGmailSearch({
      side: "owner",
      query: 'from:"suran lee"',
      maxResults: 5,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining(
          "https://cloud.example/api/v1/milady/google/gmail/search?side=owner&query=from%3A%22suran+lee%22&maxResults=5",
        ),
      }),
      expect.any(Object),
    );
  });

  it("starts managed Google auth through the generic cloud OAuth route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
          provider: { id: "google", name: "Google" },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const client = new GoogleManagedClient({
      configured: true,
      apiKey: "test-key",
      apiBaseUrl: "https://cloud.example/api/v1",
      siteUrl: "https://cloud.example",
    });

    const result = await client.startConnector({
      side: "agent",
      capabilities: ["google.calendar.read", "google.gmail.send"],
      redirectUrl: "https://milady.example/callback",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://cloud.example/api/v1/oauth/google/initiate",
      }),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          redirectUrl: "https://milady.example/callback",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/gmail.send",
          ],
          connectionRole: "agent",
        }),
      }),
    );
    expect(result).toEqual({
      provider: "google",
      side: "agent",
      mode: "cloud_managed",
      requestedCapabilities: [
        "google.basic_identity",
        "google.calendar.read",
        "google.gmail.send",
      ],
      redirectUri: "https://milady.example/callback",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
    });
  });
});
