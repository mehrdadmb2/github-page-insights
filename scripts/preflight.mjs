import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const packageFile = path.join(root, "package.json");
let packageJson;
try { packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8")); }
catch (error) { throw new Error(`PACKAGE_JSON_INVALID:${error.message}`); }
const required = [
  "wrangler.jsonc",
  "package.json",
  "worker/index.js",
  "docs/index.html",
  "docs/style.css",
  "docs/app.js",
  "docs/analytics.js",
  "docs/config.js",
  "docs/api-schema.json",
  "db/schema-v9.sql",
  "db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql",
  ".github/workflows/pages.yml"
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`MISSING_FILE:${rel}`);
}

const wrangler = fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8");
if (!/"name"\s*:\s*"github-page-insights-worker"/.test(wrangler)) throw new Error("WORKER_NAME_MISMATCH");
if (!/"main"\s*:\s*"worker\/index\.js"/.test(wrangler)) throw new Error("WORKER_MAIN_MISMATCH");
if ((process.env.REQUIRE_D1_CONFIG === "true" || process.env.CHECK_DEPLOY_CONFIG === "true") && /YOUR_D1_DATABASE_ID|REPLACE_WITH_YOUR_D1_DATABASE_ID/.test(wrangler)) {
  throw new Error("D1_DATABASE_ID_NOT_CONFIGURED: replace YOUR_D1_DATABASE_ID in wrangler.jsonc before deploy");
}

const run = (file, args) => execFileSync(process.execPath, ["--check", file, ...args], { stdio: "inherit" });
run(path.join(root, "worker/index.js"), []);
run(path.join(root, "docs/app.js"), []);
run(path.join(root, "docs/analytics.js"), []);
run(path.join(root, "docs/config.js"), []);

const pagesWorkflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
if (!pagesWorkflow.includes("docs/**")) throw new Error("PAGES_WORKFLOW_PATH_FILTER_MISSING");
if (pagesWorkflow.includes("push:\n    branches:\n      - main\n  workflow_dispatch")) throw new Error("PAGES_WORKFLOW_WATCHES_ALL_PUSHES");
if (!pagesWorkflow.includes("actions/checkout@v6")) throw new Error("PAGES_CHECKOUT_VERSION_MISSING");
if (!pagesWorkflow.includes("actions/upload-pages-artifact@v4")) throw new Error("PAGES_ARTIFACT_VERSION_MISSING");
if (!pagesWorkflow.includes("actions/deploy-pages@v4")) throw new Error("PAGES_DEPLOY_VERSION_MISSING");
if (packageJson.scripts?.check !== "node scripts/preflight.mjs") throw new Error("PACKAGE_CHECK_SCRIPT_MISMATCH");
if (packageJson.scripts?.build !== "node scripts/build.mjs") throw new Error("PACKAGE_BUILD_SCRIPT_MISMATCH");
if (packageJson.devDependencies?.wrangler !== "4.145.0") throw new Error("WRANGLER_VERSION_MISMATCH");

execFileSync(process.execPath, [path.join(root, "scripts/validate-schema.mjs")], { stdio: "inherit" });
console.log("PREFLIGHT PASS — source, config and schema contract are valid.");
