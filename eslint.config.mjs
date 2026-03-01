import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.js",
      "**/*.mjs",
      "tools/**",
      "client/node_modules/.vite/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Colyseus @type() decorators require these — Colyseus APIs use `any` pervasively
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",

      // Colyseus schema fields use @type("string") with explicit initializers — decorator requires the type annotation
      "@typescript-eslint/no-inferrable-types": "off",

      // Colyseus schema stores phase/role as `string`, compared against enums at runtime
      "@typescript-eslint/no-unsafe-enum-comparison": "off",

      // Game code often uses non-null assertions for validated state
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Allow numeric operations in template literals and + operator
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
        allowBoolean: true,
      }],
      "@typescript-eslint/restrict-plus-operands": ["error", {
        allowNumberAndString: true,
        allowAny: true,
      }],

      // Allow empty functions (event handler stubs)
      "@typescript-eslint/no-empty-function": "off",

      // Allow void in statement position (fire-and-forget promises)
      "@typescript-eslint/no-confusing-void-expression": ["error", {
        ignoreArrowShorthand: true,
      }],

      // Unused vars: allow underscore-prefixed
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],

      // Client code has unavoidable optional chains on Colyseus state that may be undefined at runtime
      "@typescript-eslint/no-unnecessary-condition": "warn",

      // Colyseus state values can be falsy (0, ""), `??` changes semantics vs `||`
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      // Game code uses async event handlers in UI onClick etc.
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: { attributes: false },
      }],
    },
  },
);
