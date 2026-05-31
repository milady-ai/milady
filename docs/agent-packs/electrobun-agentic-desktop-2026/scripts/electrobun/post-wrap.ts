#!/usr/bin/env bun
const wrapper = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
if (process.env.ELECTROBUN_BUILD_ENV !== "dev" && !wrapper) {
  console.warn("postWrap: ELECTROBUN_WRAPPER_BUNDLE_PATH was not provided for a non-dev build.");
}
console.log(`postWrap OK: wrapper=${wrapper ?? "<unset>"}`);
