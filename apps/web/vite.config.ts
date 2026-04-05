import path from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { createHighlighter } from "shiki";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Build-time Shiki highlighter shared across all MDX code blocks. Creating the
// highlighter once and passing it into rehype keeps the Vite config hot-reload
// friendly and avoids re-initializing Wasm on every file.
const highlighter = await createHighlighter({
  themes: ["github-dark"],
  langs: [
    "bash",
    "console",
    "diff",
    "html",
    "json",
    "jsonc",
    "markdown",
    "md",
    "mdx",
    "powershell",
    "shellsession",
    "toml",
    "ts",
    "tsx",
    "typescript",
    "yaml",
  ],
});

export default defineConfig({
  root: here,
  base: "/",
  publicDir: path.resolve(here, "public"),
  plugins: [
    tailwindcss(),
    // MDX MUST come before @vitejs/plugin-react-swc so .mdx files are compiled
    // to JSX first and then handed to SWC. The `providerImportSource` pulls
    // component overrides from @mdx-js/react so MDXProvider mapping works.
    mdx({
      providerImportSource: "@mdx-js/react",
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: "wrap",
            properties: { className: ["anchor"] },
          },
        ],
        [
          rehypeShikiFromHighlighter,
          highlighter,
          {
            theme: "github-dark",
            defaultLanguage: "text",
            fallbackLanguage: "text",
          },
        ],
      ],
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@miladyai/ui": path.resolve(here, "../../packages/ui/src/index.ts"),
    },
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    host: true,
    port: 2139,
    strictPort: true,
  },
});
