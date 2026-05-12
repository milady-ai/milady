# M02 — Cross-build native dependencies for iOS

**Owner:** TBD
**Status:** Not started
**Predecessors:** None (parallelizable with M01)
**Successors:** M03

## Goal

Produce iOS static libraries for every native dep Bun pulls in (besides WebKit/JSC, which is M01). Both `aarch64-ios` and `aarch64-ios-simulator` slices.

## Dependencies in scope

| Dep         | Used for                                | iOS port notes                              |
|-------------|------------------------------------------|---------------------------------------------|
| BoringSSL   | TLS, crypto                              | Standard CMake toolchain; builds for iOS    |
| c-ares      | Async DNS                                | Standard autotools, needs `--host` flag     |
| lol-html    | HTMLRewriter                             | Rust crate; cross-compile via `cargo build --target aarch64-apple-ios` |
| mimalloc    | Allocator                                | Standard CMake; works iOS                   |
| zstd        | Compression                              | Standard CMake; works iOS                   |
| libuv       | Loop (Bun uses on Windows; macOS/Linux uses native kqueue/epoll) | **Skip for iOS** — Bun uses kqueue directly |
| TinyCC      | `bun:ffi` `cc` compiler                  | **EXCLUDE from iOS build** — banned by sandbox |
| Brotli      | HTTP compression                         | Standard CMake; works iOS                   |

## Acceptance Criteria

- [ ] `vendor-deps/build-all-ios.sh <target>` produces all of:
  - `libssl.a`, `libcrypto.a` (BoringSSL)
  - `libcares.a` (c-ares)
  - `liblolhtml.a` (lol-html)
  - `libmimalloc.a`
  - `libzstd.a`
  - `libbrotlienc.a`, `libbrotlidec.a`
- [ ] Both `aarch64-ios` and `aarch64-ios-simulator` slices.
- [ ] `nm` on each archive shows no private-API symbols.
- [ ] `otool -L` on a linked binary using all of them shows only public iOS frameworks.
- [ ] `vendor-deps/VERSIONS` pins exact upstream tags/commits for each dep.
- [ ] Builds take <30 min for the full set on M3 Pro / 32GB.

## Per-dep recipes

### BoringSSL
```bash
git clone https://boringssl.googlesource.com/boringssl vendor-deps/boringssl/src
cd vendor-deps/boringssl/src
git checkout <PINNED_SHA>
mkdir build-ios && cd build-ios
cmake .. \
  -DCMAKE_TOOLCHAIN_FILE=../../../../toolchain/ios.cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF
make -j$(sysctl -n hw.ncpu)
```

### c-ares
```bash
./configure --host=arm-apple-darwin --enable-static --disable-shared \
  CC="xcrun -sdk iphoneos clang -arch arm64 -mios-version-min=15.0"
make -j$(sysctl -n hw.ncpu)
```

### lol-html
```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cargo build --release --target aarch64-apple-ios --features ffi
# output: target/aarch64-apple-ios/release/liblolhtml.a
```

### mimalloc
```bash
cmake -B build-ios -S . \
  -DCMAKE_TOOLCHAIN_FILE=../toolchain/ios.cmake \
  -DMI_BUILD_SHARED=OFF -DMI_BUILD_STATIC=ON -DMI_BUILD_TESTS=OFF
cmake --build build-ios --target mimalloc-static -j
```

### zstd
```bash
cmake -B build-ios -S build/cmake \
  -DCMAKE_TOOLCHAIN_FILE=../../toolchain/ios.cmake \
  -DZSTD_BUILD_PROGRAMS=OFF -DZSTD_BUILD_SHARED=OFF -DZSTD_BUILD_STATIC=ON
cmake --build build-ios -j
```

### Brotli
```bash
cmake -B build-ios -S . \
  -DCMAKE_TOOLCHAIN_FILE=../toolchain/ios.cmake \
  -DBROTLI_BUNDLED_MODE=ON -DBUILD_SHARED_LIBS=OFF
cmake --build build-ios -j
```

## TinyCC exclusion

Bun's `bun:ffi.cc()` builds C source at runtime via TinyCC. This is **forbidden on iOS** (runtime executable-page allocation, App Store rejection guaranteed). We remove TinyCC from the iOS build product, not stub it. Concretely:

1. In `src-bun-fork/CMakeLists.txt`, gate the `add_subdirectory(vendor/tinycc)` call on `if(NOT BUN_IOS)`.
2. In Bun's FFI module, gate the `cc` export on the same flag — on iOS, the symbol doesn't exist; calling it throws `TypeError: Bun.cc is not a function`.
3. CI gate: `nm libbun.a | grep -i tcc_` must return empty for iOS builds.

## Effort estimate

- Nominal: 1 week
- With version-pinning + CI: 2 weeks

## References

- BoringSSL iOS build: https://boringssl.googlesource.com/boringssl/+/master/INCORPORATING.md
- lol-html: https://github.com/cloudflare/lol-html
- Rust iOS targets: https://doc.rust-lang.org/rustc/platform-support/apple-ios.html
