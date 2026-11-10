import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["@morechat/vitest-setup/web-storage"],
    include: ["**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
