import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const worker = read("worker/index.js");
const schema = read("db/schema-v9.sql");
const apiSchema = JSON.parse(read("docs/api-schema.json"));

function quotedArray(source, name) {
  const re = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`);
  const match = source.match(re);
  if (!match) throw new Error(`MISSING_ARRAY:${name}`);
  return [...match[1].matchAll(/"([a-z0-9_]+)"/g)].map(m => m[1]);
}

function tableColumns(source, table) {
  const re = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`);
  const match = source.match(re);
  if (!match) throw new Error(`MISSING_TABLE:${table}`);
  return match[1].split("\n").map(line => line.trim().replace(/,$/, "")).filter(Boolean).flatMap(line => {
    if (line.startsWith("--")) return [];
    const first = line.split(/\s+/)[0].replaceAll("`", "");
    return /^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(first) ? [] : (/^[A-Za-z_][A-Za-z0-9_]*$/.test(first) ? [first] : []);
  });
}

const sets = {
  events: [quotedArray(worker, "EVENT_COLUMNS"), tableColumns(schema, "events")],
  platforms: [quotedArray(worker, "PLATFORM_COLUMNS"), tableColumns(schema, "platforms")],
  visitors: [quotedArray(worker, "VISITOR_COLUMNS"), tableColumns(schema, "platform_visitors")],
  sessions: [quotedArray(worker, "SESSION_COLUMNS"), tableColumns(schema, "platform_sessions")]
};
for (const [name, [a, b]] of Object.entries(sets)) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`COLUMN_MISMATCH:${name}`);
}
if (sets.events[0].length !== 96) throw new Error(`EVENT_COLUMN_COUNT:${sets.events[0].length}`);
if (apiSchema.eventColumnCount !== 96) throw new Error(`API_SCHEMA_EVENT_COUNT:${apiSchema.eventColumnCount}`);
if (apiSchema.workerVersion !== "12.1.0") throw new Error(`API_SCHEMA_WORKER_VERSION:${apiSchema.workerVersion}`);
if (!apiSchema.collection?.required?.includes("platformId")) throw new Error("API_SCHEMA_REQUIRED_PLATFORM_ID_MISSING");
if (apiSchema.collection?.path !== "/v1/events") throw new Error("API_SCHEMA_COLLECTION_PATH_MISMATCH");
if (!Array.isArray(apiSchema.readEndpoints) || !apiSchema.readEndpoints.length) throw new Error("API_SCHEMA_READ_ENDPOINTS_MISSING");
if (!Array.isArray(apiSchema.adminEndpoints) || !apiSchema.adminEndpoints.length) throw new Error("API_SCHEMA_ADMIN_ENDPOINTS_MISSING");
console.log(`SCHEMA PASS — events=${sets.events[0].length}, platforms=${sets.platforms[0].length}, visitors=${sets.visitors[0].length}, sessions=${sets.sessions[0].length}`);
