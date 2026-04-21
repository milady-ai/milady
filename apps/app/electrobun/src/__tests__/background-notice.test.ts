import path from "node:path";

import { describe, expect, it } from "vitest";
import {
  BACKGROUND_NOTICE_MARKER_FILE,
  hasSeenBackgroundNotice,
  markBackgroundNoticeSeen,
  resolveBackgroundNoticeMarkerPath,
  showBackgroundNoticeOnce,
} from "../background-notice";

describe("background notice", () => {
  const userDataDir = path.join("/tmp", "milady");
  const otherDataDir = path.join("/tmp", "other");
  const markerPath = path.join(userDataDir, BACKGROUND_NOTICE_MARKER_FILE);

  it("resolves the marker path under the userData directory", () => {
    expect(resolveBackgroundNoticeMarkerPath(userDataDir)).toBe(markerPath);
  });

  it("reports whether the background notice marker already exists", () => {
    const seenPaths = new Set([markerPath]);
    const fileSystem = {
      existsSync: (filePath: string) => seenPaths.has(filePath),
      mkdirSync: () => {},
      writeFileSync: () => {},
    };

    expect(hasSeenBackgroundNotice(fileSystem, userDataDir)).toBe(true);
    expect(hasSeenBackgroundNotice(fileSystem, otherDataDir)).toBe(false);
  });

  it("writes the marker file when the background notice is shown", () => {
    const mkdirCalls: Array<{ dirPath: string; recursive?: boolean }> = [];
    const writeCalls: Array<{
      filePath: string;
      data: string;
      encoding: BufferEncoding;
    }> = [];
    const fileSystem = {
      existsSync: () => false,
      mkdirSync: (
        dirPath: string,
        options?: {
          recursive?: boolean;
        },
      ) => {
        mkdirCalls.push({ dirPath, recursive: options?.recursive });
      },
      writeFileSync: (
        filePath: string,
        data: string,
        encoding: BufferEncoding,
      ) => {
        writeCalls.push({ filePath, data, encoding });
      },
    };

    const createdMarkerPath = markBackgroundNoticeSeen(fileSystem, userDataDir);

    expect(createdMarkerPath).toBe(markerPath);
    expect(mkdirCalls).toEqual([
      {
        dirPath: userDataDir,
        recursive: true,
      },
    ]);
    expect(writeCalls).toEqual([
      {
        filePath: markerPath,
        data: '{"seen":true}\n',
        encoding: "utf8",
      },
    ]);
  });

  it("shows the notification once and skips subsequent attempts", () => {
    const seenPaths = new Set<string>();
    const notifications: Array<{ title: string; body: string }> = [];
    const fileSystem = {
      existsSync: (filePath: string) => seenPaths.has(filePath),
      mkdirSync: () => {},
      writeFileSync: (filePath: string) => {
        seenPaths.add(filePath);
      },
    };

    expect(
      showBackgroundNoticeOnce({
        fileSystem,
        userDataDir,
        showNotification: (options) => {
          notifications.push(options);
        },
      }),
    ).toBe(true);
    expect(
      showBackgroundNoticeOnce({
        fileSystem,
        userDataDir,
        showNotification: (options) => {
          notifications.push(options);
        },
      }),
    ).toBe(false);
    expect(notifications).toHaveLength(1);
  });
});
