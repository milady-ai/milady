import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import {
  distAlreadyHasBridgeFixes,
  distUsesLegacyAiSdkObjectGeneration,
} from "./patch-elizacloud.mjs";

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

describe("patch-elizacloud", () => {
  it("detects the npm alpha.8 legacy AI SDK object-generation build", () => {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "milady-patch-"));

    const legacyObjectModelDist = `
async function generateObjectByModelType(runtime, params, modelType, getModelFn) {
  const openai = createOpenAIClient(runtime);
  try {
    const { object, usage } = await generateObject({
      model,
      output: "no-schema",
      prompt: params.prompt,
      experimental_repairText: getJsonRepairFunction()
    });
    return object;
  } catch (error) {
    if (error instanceof JSONParseError2) {
      const cleanedText = text.replace(/\`\`\`json\\n|\\n\`\`\`|\`\`\`/g, "");
      return JSON.parse(cleanedText);
    }
    throw error;
  }
}
`;

    writeFile(
      path.join(pluginRoot, "dist", "node", "index.node.js"),
      legacyObjectModelDist,
    );
    writeFile(
      path.join(pluginRoot, "dist", "cjs", "index.node.cjs"),
      legacyObjectModelDist,
    );

    expect(distAlreadyHasBridgeFixes(pluginRoot)).toBe(false);
    expect(distUsesLegacyAiSdkObjectGeneration(pluginRoot)).toBe(true);
  });
});
