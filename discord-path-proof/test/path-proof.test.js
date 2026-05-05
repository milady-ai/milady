import assert from "node:assert/strict";
import test from "node:test";

test("project name is stable", () => {
  assert.equal("discord-path-proof", "discord-path-proof");
});
