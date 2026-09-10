import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Heavy module-graph tests (App smoke, ProductForm render) exceed the 5s
    // default when the whole suite runs in parallel; they pass in isolation.
    testTimeout: 30_000,
    hookTimeout: 30_000,

  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
