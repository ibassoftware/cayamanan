import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { noRawDbAccessOptions, noRestrictedImportsOptions } from "./eslint-rules/no-raw-db-access.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 00-overview.md §4.8: all DB access from src/modules/** must go through
    // withTenantContext()/ctx.db — never a raw db/pool handle. The import ban is the
    // real, rename-proof boundary; the syntax rule is belt-and-braces.
    files: ["src/modules/**/*.ts", "src/modules/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...noRawDbAccessOptions],
      "no-restricted-imports": ["error", noRestrictedImportsOptions],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
