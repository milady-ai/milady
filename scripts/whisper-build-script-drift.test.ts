import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD_WHISPER_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/build-whisper.sh",
);
const BUILD_WHISPER_UNIVERSAL_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/build-whisper-universal.sh",
);
const ENSURE_WHISPER_MODEL_PATH = path.join(
  ROOT,
  "apps/app/electrobun/scripts/ensure-whisper-model.sh",
);

describe("Whisper build script drift", () => {
  it("delegates model restore/download to the shared helper", () => {
    const buildWhisper = fs.readFileSync(BUILD_WHISPER_PATH, "utf8");
    const buildWhisperUniversal = fs.readFileSync(
      BUILD_WHISPER_UNIVERSAL_PATH,
      "utf8",
    );

    expect(buildWhisper).toContain('ensure-whisper-model.sh" "$MODEL"');
    expect(buildWhisper).not.toContain(
      'bash models/download-ggml-model.sh "$MODEL"',
    );

    expect(buildWhisperUniversal).toContain(
      'ensure-whisper-model.sh" "$MODEL"',
    );
    expect(buildWhisperUniversal).not.toContain(
      'bash models/download-ggml-model.sh "$MODEL"',
    );
  });

  it("retries whisper model downloads before failing CI", () => {
    const helper = fs.readFileSync(ENSURE_WHISPER_MODEL_PATH, "utf8");

    expect(helper).toContain("MILADY_WHISPER_DOWNLOAD_ATTEMPTS");
    expect(helper).toContain("MILADY_WHISPER_DOWNLOAD_RETRY_DELAY_SECONDS");
    expect(helper).toContain("Restoring whisper model from cache");
    expect(helper).toContain("Downloading model attempt");
    expect(helper).toContain('bash models/download-ggml-model.sh "$MODEL"');
    expect(helper).toContain(`retrying in \${RETRY_DELAY_SECONDS}s`);
  });
});
