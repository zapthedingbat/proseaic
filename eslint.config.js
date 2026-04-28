import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "scripts/**"] },

  // JavaScript (server — Node.js runtime)
  {
    files: ["src/server/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // TypeScript (browser)
  {
    files: ["src/browser/**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // Tests
  {
    files: ["test/**/*.ts", "src/**/*.test.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  prettierConfig,
);
