import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAvatarRoutes } from "./avatar-routes.js";

describe("handleAvatarRoutes", () => {
  let tempStateDir = "";

  beforeEach(() => {
    tempStateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-avatar-routes-"),
    );
    process.env.MILADY_STATE_DIR = tempStateDir;
  });

  afterEach(() => {
    delete process.env.MILADY_STATE_DIR;
    if (tempStateDir) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
      tempStateDir = "";
    }
  });

  it("serves cached Discord avatars from the local cache directory", async () => {
    const avatarDir = path.join(tempStateDir, "cache", "discord-avatars");
    fs.mkdirSync(avatarDir, { recursive: true });
    const fileName = "user-123-avatar.png";
    const avatarBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    fs.writeFileSync(path.join(avatarDir, fileName), avatarBytes);

    const writeHead = vi.fn();
    const end = vi.fn();
    const handled = await handleAvatarRoutes({
      req: {} as http.IncomingMessage,
      res: { end, writeHead } as unknown as http.ServerResponse,
      method: "GET",
      pathname: `/api/avatar/discord/${fileName}`,
      json: vi.fn(),
      error: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "image/png",
      }),
    );
    expect(end).toHaveBeenCalledWith(avatarBytes);
  });
});
