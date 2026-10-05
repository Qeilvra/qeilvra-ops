import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { builtinModules } from "node:module";
import path from "node:path";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

import { boundaryRule, environmentRule } from "./scripts/eslint-boundaries.mjs";

const browserGlobals = [
  {
    name: "process",
    message: "Process settings belong to API/worker code, never browser/UI source.",
  },
  "Buffer",
  "__dirname",
  "__filename",
  "require",
  "module",
  "exports",
  "global",
  "setImmediate",
  "clearImmediate",
];

const typedRules = {
  "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/consistent-type-imports": "error",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      ".cache/**",
      "**/next-env.d.ts",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/*.tsbuildinfo",
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-debugger": "error",
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "no-async-promise-executor": "error",
    },
  },
  {
    files: ["**/*.cjs", "**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    // Existing Node tests and tooling use native CommonJS; TS/browser code does not.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: typedRules,
  },
  {
    files: ["playwright.config.ts", "tests/browser/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.tools.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typedRules,
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx,js,jsx}", "packages/ui/src/**/*.{ts,tsx,js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: { next: { rootDir: path.join(import.meta.dirname, "apps/web") } },
    rules: nextPlugin.configs["core-web-vitals"].rules,
  },
  {
    files: ["apps/**/*.{ts,tsx,js,jsx,mjs,cjs}", "packages/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    plugins: {
      airmech: {
        rules: {
          "package-boundaries": boundaryRule,
          "centralized-environment": environmentRule,
        },
      },
    },
    rules: {
      "airmech/package-boundaries": "error",
      "airmech/centralized-environment": "error",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,mjs}", "packages/ui/**/*.{ts,tsx,js,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@airmech/database",
                "@airmech/database/*",
                "@airmech/queue",
                "@airmech/queue/*",
                "@airmech/storage",
                "@airmech/storage/*",
                "**/database/**",
                "**/apps/api/**",
                "**/apps/worker/**",
              ],
              message: "Browser and UI code must use API contracts, never server/database modules.",
            },
            {
              group: [
                "pg",
                "@prisma/client",
                "bullmq",
                "ioredis",
                "@supabase/supabase-js",
                ...builtinModules,
                "node:*",
                "@nestjs/*",
              ],
              message:
                "Server-only dependencies and environment configuration must not enter browser/UI code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx,js}", "packages/ui/src/**/*.{ts,tsx,js}"],
    rules: {
      "no-restricted-globals": ["error", ...browserGlobals],
    },
  },
  {
    files: ["apps/web/src/config/client.ts"],
    rules: {
      // The custom rule permits only the direct literal NEXT_PUBLIC_APP_NAME read.
      "no-restricted-globals": [
        "error",
        ...browserGlobals.filter((global) => typeof global === "string"),
      ],
    },
  },
  {
    files: ["packages/config/src/client.ts", "packages/config/src/validation.ts"],
    rules: {
      "no-restricted-globals": ["error", ...browserGlobals],
    },
  },
  {
    files: ["packages/contracts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...builtinModules,
            "node:*",
            "@nestjs/*",
            "next",
            "next/*",
            "react",
            "react/*",
            "react-dom",
            "react-dom/*",
            "@airmech/config",
            "@airmech/config/*",
            "@airmech/database",
            "@airmech/database/*",
            "@airmech/ui",
            "@airmech/ui/*",
            "**/apps/**",
            "**/database/**",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/config/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@airmech/database", "@airmech/ui", "**/apps/**", "**/database/**"] },
      ],
    },
  },
);
