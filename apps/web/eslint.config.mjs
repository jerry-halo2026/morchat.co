import nextConfig from "@morechat/eslint-config/next";
import globals from "globals";

export default [
  ...nextConfig,
  { ignores: [".next/", ".source/"] },
  {
    // Node-side helper scripts, not app code: they read `process.env` and run
    // under node, so the browser globals the Next config assumes do not apply.
    files: ["scripts/**/*.{mjs,js,cjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      "react/display-name": "off",
    },
  },
];
