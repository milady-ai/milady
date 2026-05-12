// Node path (posix). Based on path-browserify (MIT). iOS is POSIX so we only
// ship the posix flavor; if win32 is requested, throw.

function assertPath(p: unknown): asserts p is string {
  if (typeof p !== "string") throw new TypeError("path must be a string");
}

function normalizeStringPosix(path: string, allowAboveRoot: boolean): string {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i);
    else if (code === 47) break;
    else code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1) {
        // skip
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(res.length - 1) !== 46 ||
          res.charCodeAt(res.length - 2) !== 46
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              }
              lastSlash = i;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += "/..";
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += "/" + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

export function resolve(...args: string[]): string {
  let resolvedPath = "";
  let resolvedAbsolute = false;
  for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const path = i >= 0 ? args[i]! : "/";
    assertPath(path);
    if (path.length === 0) continue;
    resolvedPath = path + "/" + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute) return "/" + resolvedPath;
  return resolvedPath.length > 0 ? resolvedPath : ".";
}

export function normalize(path: string): string {
  assertPath(path);
  if (path.length === 0) return ".";
  const isAbsolute = path.charCodeAt(0) === 47;
  const trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  path = normalizeStringPosix(path, !isAbsolute);
  if (path.length === 0 && !isAbsolute) path = ".";
  if (path.length > 0 && trailingSeparator) path += "/";
  return isAbsolute ? "/" + path : path;
}

export function isAbsolute(path: string): boolean {
  assertPath(path);
  return path.length > 0 && path.charCodeAt(0) === 47;
}

export function join(...args: string[]): string {
  if (args.length === 0) return ".";
  let joined = "";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    assertPath(arg);
    if (arg.length > 0) {
      if (joined === undefined || joined.length === 0) joined = arg;
      else joined += "/" + arg;
    }
  }
  if (joined === undefined || joined.length === 0) return ".";
  return normalize(joined);
}

export function relative(from: string, to: string): string {
  assertPath(from);
  assertPath(to);
  if (from === to) return "";
  from = resolve(from);
  to = resolve(to);
  if (from === to) return "";
  let fromStart = 1;
  for (; fromStart < from.length; ++fromStart) {
    if (from.charCodeAt(fromStart) !== 47) break;
  }
  const fromEnd = from.length;
  const fromLen = fromEnd - fromStart;
  let toStart = 1;
  for (; toStart < to.length; ++toStart) {
    if (to.charCodeAt(toStart) !== 47) break;
  }
  const toEnd = to.length;
  const toLen = toEnd - toStart;
  const length = fromLen < toLen ? fromLen : toLen;
  let lastCommonSep = -1;
  let i = 0;
  for (; i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47) return to.slice(toStart + i + 1);
        else if (i === 0) return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47) lastCommonSep = i;
        else if (i === 0) lastCommonSep = 0;
      }
      break;
    }
    const fromCode = from.charCodeAt(fromStart + i);
    const toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode) break;
    else if (fromCode === 47) lastCommonSep = i;
  }
  let out = "";
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
    if (i === fromEnd || from.charCodeAt(i) === 47) {
      if (out.length === 0) out += "..";
      else out += "/..";
    }
  }
  if (out.length > 0) return out + to.slice(toStart + lastCommonSep);
  toStart += lastCommonSep;
  if (to.charCodeAt(toStart) === 47) ++toStart;
  return to.slice(toStart);
}

export function dirname(path: string): string {
  assertPath(path);
  if (path.length === 0) return ".";
  const hasRoot = path.charCodeAt(0) === 47;
  let end = -1;
  let matchedSlash = true;
  for (let i = path.length - 1; i >= 1; --i) {
    if (path.charCodeAt(i) === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) return hasRoot ? "/" : ".";
  if (hasRoot && end === 1) return "//";
  return path.slice(0, end);
}

export function basename(path: string, ext?: string): string {
  assertPath(path);
  if (ext !== undefined && typeof ext !== "string")
    throw new TypeError("ext must be a string");
  let start = 0;
  let end = -1;
  let matchedSlash = true;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path) return "";
    let extIdx = ext.length - 1;
    let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= 0; --i) {
      const code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1) end = i;
          } else {
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }
    if (start === end) end = firstNonSlashEnd;
    else if (end === -1) end = path.length;
    return path.slice(start, end);
  }
  for (let i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === 47) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }
  if (end === -1) return "";
  return path.slice(start, end);
}

export function extname(path: string): string {
  assertPath(path);
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;
  for (let i = path.length - 1; i >= 0; --i) {
    const code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46) {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }
  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    return "";
  }
  return path.slice(startDot, end);
}

export function format(pathObject: {
  root?: string;
  dir?: string;
  base?: string;
  name?: string;
  ext?: string;
}): string {
  const dir = pathObject.dir ?? pathObject.root;
  const base = pathObject.base ?? (pathObject.name ?? "") + (pathObject.ext ?? "");
  if (!dir) return base;
  if (dir === pathObject.root) return dir + base;
  return dir + "/" + base;
}

export function parse(path: string): {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
} {
  assertPath(path);
  const ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0) return ret;
  const isAbs = path.charCodeAt(0) === 47;
  let start: number;
  if (isAbs) {
    ret.root = "/";
    start = 1;
  } else {
    start = 0;
  }
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let i = path.length - 1;
  let preDotState = 0;
  for (; i >= start; --i) {
    const code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46) {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }
  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    if (end !== -1) {
      if (startPart === 0 && isAbs) ret.base = ret.name = path.slice(1, end);
      else ret.base = ret.name = path.slice(startPart, end);
    }
  } else {
    if (startPart === 0 && isAbs) {
      ret.name = path.slice(1, startDot);
      ret.base = path.slice(1, end);
    } else {
      ret.name = path.slice(startPart, startDot);
      ret.base = path.slice(startPart, end);
    }
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
  else if (isAbs) ret.dir = "/";
  return ret;
}

export const sep = "/";
export const delimiter = ":";

export const posix = {
  resolve,
  normalize,
  isAbsolute,
  join,
  relative,
  dirname,
  basename,
  extname,
  format,
  parse,
  sep,
  delimiter,
};

export const win32 = posix; // iOS is POSIX; we don't ship win32

export default {
  resolve,
  normalize,
  isAbsolute,
  join,
  relative,
  dirname,
  basename,
  extname,
  format,
  parse,
  sep,
  delimiter,
  posix,
  win32,
};
