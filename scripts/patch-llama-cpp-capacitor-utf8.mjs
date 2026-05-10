#!/usr/bin/env node
/**
 * Replace `llama-cpp-capacitor`'s JNI `string_to_jstring` helper so it does
 * a real UTF-8 → UTF-16 conversion before calling `NewString`.
 *
 * The upstream helper is:
 *   jstring string_to_jstring(JNIEnv* env, const std::string& str) {
 *       return env->NewStringUTF(str.c_str());
 *   }
 *
 * `NewStringUTF` expects Java's "modified UTF-8" encoding, which cannot
 * represent 4-byte UTF-8 sequences (supplementary-plane chars — most emoji,
 * many CJK extension blocks, math/musical symbols). llama.cpp's tokenizer
 * routinely emits such sequences. CheckJNI catches the first one and
 * aborts the host process with
 *   F libc : Fatal signal 6 (SIGABRT) ... in
 *   libllama-cpp-x86_64.so (Java_ai_annadata_plugin_capacitor_LlamaCpp
 *                            _completionNative+6528)
 * which on Cuttlefish takes the entire app process down before any token
 * makes it to the JS bridge.
 *
 * Patching this through bun's `patchedDependencies` proved fragile —
 * adding a hunk near the top of jni.cpp shifts subsequent hunks and bun's
 * patch parser does not track those shifts cleanly. A direct string
 * replacement on the installed file is simpler and idempotent.
 *
 * Idempotent: detects the patched marker (`new_string_from_utf8`) and
 * exits early.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");

const ORIGINAL = `jstring string_to_jstring(JNIEnv* env, const std::string& str) {
    return env->NewStringUTF(str.c_str());
}`;

const REPLACEMENT = `// NewStringUTF interprets its argument as Java's "modified UTF-8" encoding,
// which cannot represent 4-byte UTF-8 sequences (supplementary plane chars,
// e.g. most emoji and CJK extension blocks). llama.cpp's tokenizer routinely
// emits such sequences, and CheckJNI aborts the host process the first time
// the bridge tries to surface one ("input is not valid Modified UTF-8").
//
// Decode standard UTF-8 to UTF-16 surrogate-aware jchars and use NewString
// instead, which speaks the JVM's native string encoding directly.
static jstring new_string_from_utf8(JNIEnv* env, const std::string& str) {
    std::vector<jchar> utf16;
    utf16.reserve(str.size());
    const unsigned char* p = reinterpret_cast<const unsigned char*>(str.data());
    const unsigned char* end = p + str.size();
    while (p < end) {
        uint32_t cp = 0;
        int extra = 0;
        unsigned char c = *p++;
        if (c < 0x80) {
            cp = c;
        } else if ((c >> 5) == 0x6) {
            cp = c & 0x1F; extra = 1;
        } else if ((c >> 4) == 0xE) {
            cp = c & 0x0F; extra = 2;
        } else if ((c >> 3) == 0x1E) {
            cp = c & 0x07; extra = 3;
        } else {
            cp = 0xFFFD;
        }
        for (int i = 0; i < extra; i++) {
            if (p >= end || (*p & 0xC0) != 0x80) { cp = 0xFFFD; break; }
            cp = (cp << 6) | (*p++ & 0x3F);
        }
        if (cp <= 0xFFFF) {
            utf16.push_back(static_cast<jchar>(cp));
        } else if (cp <= 0x10FFFF) {
            cp -= 0x10000;
            utf16.push_back(static_cast<jchar>(0xD800 | (cp >> 10)));
            utf16.push_back(static_cast<jchar>(0xDC00 | (cp & 0x3FF)));
        } else {
            utf16.push_back(0xFFFD);
        }
    }
    return env->NewString(utf16.data(), static_cast<jsize>(utf16.size()));
}

jstring string_to_jstring(JNIEnv* env, const std::string& str) {
    return new_string_from_utf8(env, str);
}`;

function* llamaCppPackageRoots() {
  const bunDir = join(repoRoot, "node_modules", ".bun");
  if (existsSync(bunDir)) {
    for (const entry of readdirSync(bunDir)) {
      if (!entry.startsWith("llama-cpp-capacitor@")) continue;
      const pkg = join(bunDir, entry, "node_modules", "llama-cpp-capacitor");
      if (existsSync(join(pkg, "package.json"))) yield pkg;
    }
  }
  const hoisted = join(repoRoot, "node_modules", "llama-cpp-capacitor");
  if (existsSync(join(hoisted, "package.json"))) yield hoisted;
}

let patched = 0;
let alreadyPatched = 0;
let missing = 0;
for (const pkgRoot of llamaCppPackageRoots()) {
  const jni = join(pkgRoot, "android", "src", "main", "jni.cpp");
  if (!existsSync(jni)) continue;
  const text = readFileSync(jni, "utf8");
  if (text.includes("new_string_from_utf8")) {
    alreadyPatched += 1;
    continue;
  }
  if (!text.includes(ORIGINAL)) {
    console.warn(
      `[patch-llama-cpp-capacitor-utf8] WARN: ${jni} does not contain the expected NewStringUTF site; skipping.`,
    );
    missing += 1;
    continue;
  }
  writeFileSync(jni, text.replace(ORIGINAL, REPLACEMENT), "utf8");
  console.log(`[patch-llama-cpp-capacitor-utf8] patched ${jni}`);
  patched += 1;
}
console.log(
  `[patch-llama-cpp-capacitor-utf8] patched=${patched} already-patched=${alreadyPatched} unmatched=${missing}`,
);
