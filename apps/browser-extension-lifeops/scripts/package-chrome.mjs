#!/usr/bin/env node
/**
 * Zip the Chrome build for Chrome Web Store upload.
 *
 * The CWS submission itself is deferred — this script just produces
 * the artifact in `dist/artifacts/lifeops-chrome-<version>.zip`.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeflateRaw } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist/chrome");

const manifest = JSON.parse(
  await readFile(resolve(dist, "manifest.json"), "utf8"),
);
const version = manifest.version;

const artifactsDir = resolve(root, "dist/artifacts");
await mkdir(artifactsDir, { recursive: true });
const out = resolve(artifactsDir, `lifeops-chrome-${version}.zip`);

await writeZip(dist, out);
console.log(`[package] wrote ${out}`);

async function writeZip(srcDir, zipPath) {
  const files = await collectFiles(srcDir);
  const entries = [];
  let offset = 0;
  const output = createWriteStream(zipPath);
  const write = (buf) =>
    new Promise((resolvePromise, rejectPromise) => {
      output.write(buf, (err) =>
        err ? rejectPromise(err) : resolvePromise(undefined),
      );
    });

  for (const relative of files) {
    const abs = join(srcDir, relative);
    const data = await readFile(abs);
    const compressed = await deflate(data);
    const useDeflate = compressed.length < data.length;
    const body = useDeflate ? compressed : data;
    const nameBuf = Buffer.from(relative.replace(/\\/g, "/"), "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    await write(local);
    await write(nameBuf);
    await write(body);

    entries.push({
      name: nameBuf,
      crc,
      compressedSize: body.length,
      uncompressedSize: data.length,
      method: useDeflate ? 8 : 0,
      offset,
    });
    offset += local.length + nameBuf.length + body.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const e of entries) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(e.method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(e.crc, 16);
    header.writeUInt32LE(e.compressedSize, 20);
    header.writeUInt32LE(e.uncompressedSize, 24);
    header.writeUInt16LE(e.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(e.offset, 42);
    await write(header);
    await write(e.name);
    centralSize += header.length + e.name.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  await write(end);

  await new Promise((resolvePromise) => output.end(resolvePromise));
}

async function collectFiles(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectFiles(abs, rel)));
    } else if (e.isFile()) {
      const info = await stat(abs);
      if (info.size >= 0) {
        out.push(rel);
      }
    }
  }
  return out;
}

function deflate(data) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    const z = createDeflateRaw();
    z.on("data", (c) => chunks.push(c));
    z.on("end", () => resolvePromise(Buffer.concat(chunks)));
    z.on("error", rejectPromise);
    z.end(data);
  });
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
