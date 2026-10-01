import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/preflight.mjs"], {
  stdio: "inherit",
  env: { ...process.env, BUILD_ONLY: "true" }
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
