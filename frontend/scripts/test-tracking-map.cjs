// DOM component test: real React + Leaflet, no tiles/network or browser automation.
const { buildSync } = require("esbuild");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const outfile = path.resolve(
  __dirname,
  "../node_modules/.cache/fleetgo-tracking-map.cjs",
);
buildSync({
  entryPoints: [path.resolve(__dirname, "tracking-map.test.tsx")],
  outfile,
  bundle: true,
  banner: { js: "require.extensions['.css']=()=>{};" },
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: {
    "import.meta.env.VITE_MAP_TILE_URL": '"none"',
    "import.meta.env.VITE_MAP_ATTRIBUTION": '""',
  },
});
const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
