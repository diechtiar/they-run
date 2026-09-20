import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@they-run/hunt-engine": resolve(__dirname, "../../packages/hunt-engine/src/index.ts"),
    },
  },
  server: { host: true, port: 5173 },
});
