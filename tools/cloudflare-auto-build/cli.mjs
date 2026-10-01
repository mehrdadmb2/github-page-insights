#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const buildScript = path.join(cwd, "scripts", "build.mjs");
const result = spawnSync(process.execPath, [buildScript], { stdio: "inherit", env: { ...process.env, CLOUDFLARE_AUTO_COMPAT: "true" } });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
