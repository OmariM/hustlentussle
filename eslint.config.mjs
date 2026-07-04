// Lint posture matches the TS migration: strict on .ts files, hands-off on
// legacy .js (those are checked only once they are converted).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["web/js/dist/**", "node_modules/**"],
  },
  {
    files: ["web/js/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
);
