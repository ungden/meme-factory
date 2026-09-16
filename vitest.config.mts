import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` -> `./src/*` alias from tsconfig.json so tests can import
// modules the same way application code does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      // Scoped on purpose. A repo-wide threshold is either unreachable today or
      // set so low it means nothing; these are the modules that spend the
      // user's money or authenticate a provider, so they are the ones worth a
      // floor. Run with `npm run test:coverage`.
      include: [
        "src/lib/short-film/**/*.ts",
        "src/lib/wavespeed.ts",
        "src/lib/error-messages.ts",
        "src/lib/clip-dubbing.ts",
      ],
      exclude: ["**/*.test.ts"],
      // A ratchet, not an aspiration: set just under what the suite reaches
      // today so a drop is caught, and raised as coverage grows.
      thresholds: {
        statements: 28,
        branches: 21,
        functions: 32,
        lines: 29,
      },
    },
  },
});
