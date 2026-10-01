import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

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
  "docs/openapi.yaml",
  "db/schema-v9.sql",
  "db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql",
  ".github/workflows/pages.yml"
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`MISSING_FILE:${rel}`);
}

const pkg = JSON.parse(read("package.json"));
if (pkg.version !== "11.0.0") throw new Error(`PROJECT_VERSION_MISMATCH:${pkg.version}`);
if (pkg.devDependencies?.wrangler !== "4.145.0") throw new Error("WRANGLER_VERSION_MISMATCH");
if (pkg.scripts?.deploy !== "wrangler deploy") throw new Error("DEPLOY_SCRIPT_MISMATCH");
if (pkg.scripts?.check !== "node scripts/preflight.mjs") throw new Error("CHECK_SCRIPT_MISMATCH");
if (Object.keys(pkg.scripts || {}).some(k => /build/i.test(k))) throw new Error("BUILD_AUTOMATION_SCRIPT_PRESENT");

const wrangler = read("wrangler.jsonc");
if (!/"name"\s*:\s*"github-page-insights-worker"/.test(wrangler)) throw new Error("WORKER_NAME_MISMATCH");
if (!/"main"\s*:\s*"worker\/index\.js"/.test(wrangler)) throw new Error("WORKER_MAIN_MISMATCH");
if (/workers\s*build|watch\s*paths|auto-build/i.test(wrangler)) throw new Error("UNEXPECTED_BUILD_CONFIGURATION");

for (const rel of ["worker/index.js", "docs/app.js", "docs/analytics.js", "docs/config.js"]) {
  execFileSync(process.execPath, ["--check", rel], { stdio: "inherit", cwd: root });
}

const pages = read(".github/workflows/pages.yml");
if (!pages.includes('"docs/**"')) throw new Error("PAGES_DOCS_FILTER_MISSING");
if (!pages.includes("actions/checkout@v6")) throw new Error("PAGES_CHECKOUT_VERSION_MISSING");
if (!pages.includes("actions/upload-pages-artifact@v4")) throw new Error("PAGES_ARTIFACT_VERSION_MISSING");
if (!pages.includes("actions/deploy-pages@v4")) throw new Error("PAGES_DEPLOY_VERSION_MISSING");

execFileSync(process.execPath, ["scripts/validate-schema.mjs"], { stdio: "inherit", cwd: root });
console.log("PREFLIGHT PASS — manual Wrangler deployment project is structurally valid.");
