import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "prisma/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    // Startup log and CLI output are the only intended console.log calls.
    files: ["src/server.ts", "prisma/seed.ts"],
    rules: { "no-console": "off" },
  },
);
