import { sharedIgnores, sharedRules } from "@aptransit/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next already registers the jsx-a11y plugin with a few rules.
// We turn on its full recommended rule set on top (docs/04, docs/09 Accessibility).
const config = [
  sharedIgnores,
  // MapLibre worker files copied by scripts/copy-map-worker.mjs (vendor code, git-ignored)
  { ignores: ["public/maplibre-gl-*.mjs"] },
  ...nextVitals,
  ...nextTs,
  { rules: { ...jsxA11y.flatConfigs.recommended.rules } },
  sharedRules,
];

export default config;
