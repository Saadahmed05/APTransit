/* eslint-disable no-console */
// MapLibre 6 runs its tile work in a module worker. Bundled by Next, its default worker URL points
// at the page itself ("Worker failed to load"), so we serve the worker file from public/ and set
// the URL in packages/ui map-view.tsx (setWorkerUrl). Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(new URL("../../../packages/ui/package.json", import.meta.url));
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const target = new URL("../public/", import.meta.url);
mkdirSync(target, { recursive: true });
// The worker imports ./maplibre-gl-shared.mjs, so both files sit next to each other
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), new URL(file, target));
}
console.log("Copied the MapLibre worker files to public/");
