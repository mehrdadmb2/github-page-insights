import fs from "node:fs";

const cfg = fs.readFileSync("wrangler.jsonc", "utf8");
if (/YOUR_D1_DATABASE_ID|REPLACE_WITH_YOUR_D1_DATABASE_ID/.test(cfg)) {
  console.error("DEPLOY CONFIG ERROR: replace YOUR_D1_DATABASE_ID in wrangler.jsonc with the real D1 database ID before deployment.");
  process.exit(1);
}

console.log("DEPLOY CONFIG PASS");
