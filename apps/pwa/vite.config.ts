import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "1" ? "/they-run/" : "/",
  resolve: {
    alias: {
      "@they-run/hunt-engine": resolve(__dirname, "../../packages/hunt-engine/src/index.ts"),
    },
  },
  server: { host: true, port: 5173 },
});
