import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", ".pnpm-store/**", ".npm-cache/**", "releases/**", ".browser-cache/**", ".runtime/**", "test-results/**", "playwright-report/**"] },
  {
    files: ["**/*.{js,jsx,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Uppercase bindings can be referenced as JSX components.
      "no-unused-vars": ["warn", { varsIgnorePattern: "^[A-Z]", argsIgnorePattern: "^_" }],
    },
  },
];
