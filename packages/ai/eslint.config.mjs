import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // TypeScript already checks globals/types for this Node package.
      "no-undef": "off",
      // @aio/ai intentionally reads provider/runtime env vars directly.
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
