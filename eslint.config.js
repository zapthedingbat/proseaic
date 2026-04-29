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

  // TypeScript (browser) — general rules
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

  // Enforce DI boundaries: only components may reference browser globals directly.
  // All other modules must receive DOM dependencies via constructor/function arguments.
  {
    files: ["src/browser/**/*.ts"],
    ignores: ["src/browser/components/**/*.ts", "src/browser/script.ts", "src/browser/app.ts"],
    rules: {
      "no-restricted-globals": ["error",
        { name: "document", message: "Inject DOM dependencies instead of referencing `document` directly." },
        { name: "window", message: "Inject DOM dependencies instead of referencing `window` directly." },
        { name: "navigator", message: "Inject DOM dependencies instead of referencing `navigator` directly." },
        { name: "location", message: "Inject DOM dependencies instead of referencing `location` directly." },
        { name: "localStorage", message: "Inject DOM dependencies instead of referencing `localStorage` directly." },
        { name: "sessionStorage", message: "Inject DOM dependencies instead of referencing `sessionStorage` directly." },
      ],
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
