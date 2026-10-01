import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => { throw new Error(message); };
const ok = message => console.log(`PASS  ${message}`);

async function text(file) { return fs.readFile(path.join(ROOT, file), 'utf8'); }

function parseQuotedArray(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  if (!match) fail(`${name} not found`);
  return [...match[1].matchAll(/"([a-z0-9_]+)"/g)].map(m => m[1]);
}

function extractTableColumns(schema, table) {
  const match = schema.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!match) fail(`schema table ${table} not found`);
  const cols = [];
  for (const line of match[1].split('\n')) {
    const t = line.trim().replace(/,$/, '');
    if (!t || t.startsWith('--')) continue;
    const first = t.split(/\s+/)[0].replaceAll('`','');
    if (/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(first)) continue;
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(first)) cols.push(first);
  }
  return cols;
}

function countQuestions(sql) { return (sql.match(/\?/g) || []).length; }

class MockStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) {
    const expected = countQuestions(this.sql);
    if (expected !== values.length) {
      fail(`BIND_MISMATCH runtime mock: expected ${expected}, got ${values.length} SQL=${this.sql.slice(0,180)}`);
    }
    this.values = values;
    return this;
  }
  async run() { return this.db.execute(this.sql, this.values); }
  async first() { return this.db.queryOne(this.sql, this.values); }
  async all() { return this.db.queryAll(this.sql, this.values); }
}

class MockD1 {
  constructor(eventColumns, platformColumns, visitorColumns, sessionColumns) {
    this.eventColumns = eventColumns;
    this.platformColumns = platformColumns;
    this.visitorColumns = visitorColumns;
    this.sessionColumns = sessionColumns;
    this.events = new Map();
    this.tables = new Set(['schema_meta','platforms','platform_visitors','platform_sessions','events','event_archives','notification_log']);
  }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const stmt of statements) results.push(await stmt.run());
    return results;
  }
  async execute(sql, values) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();
    if (normalized.startsWith('INSERT OR IGNORE INTO EVENTS')) {
      const id = values[0];
      if (this.events.has(id)) return { success:true, meta:{changes:0} };
      const row = Object.fromEntries(this.eventColumns.map((c,i)=>[c, values[i] ?? null]));
      this.events.set(id,row);
      return { success:true, meta:{changes:1} };
    }
    return { success:true, meta:{changes:1} };
  }
  async queryOne(sql, values) {
    const n = sql.replace(/\s+/g,' ').trim().toUpperCase();
    if (n.includes('SELECT API_KEY_HASH FROM PLATFORMS')) return null;
    if (n === 'SELECT 1 AS OK') return {ok:1};
    if (n.includes('SELECT RECEIVED_AT,PLATFORM_ID,EVENT_TYPE,IP,PLATFORM_IP FROM EVENTS')) return null;
    if (n.includes('SELECT RECEIVED_AT,PLATFORM_ID,EVENT_TYPE FROM EVENTS')) return null;
    if (n.includes('SELECT COUNT(*)')) return {platforms:0,events:0,sessions:0,visitors:0,archives:0,notifications:0};
    return null;
  }
  async queryAll(sql, values) {
    const n = sql.replace(/\s+/g,' ').trim().toUpperCase();
    if (n.includes('FROM SQLITE_MASTER')) return {results:[...this.tables].map(name=>({name}))};
    if (n.startsWith('PRAGMA TABLE_INFO(EVENTS)')) return {results:this.eventColumns.map((name,cid)=>({cid,name}))};
    if (n.startsWith('PRAGMA TABLE_INFO(PLATFORMS)')) return {results:this.platformColumns.map((name,cid)=>({cid,name}))};
    if (n.startsWith('PRAGMA TABLE_INFO(PLATFORM_VISITORS)')) return {results:this.visitorColumns.map((name,cid)=>({cid,name}))};
    if (n.startsWith('PRAGMA TABLE_INFO(PLATFORM_SESSIONS)')) return {results:this.sessionColumns.map((name,cid)=>({cid,name}))};
    if (n.includes('FROM EVENTS') || n.includes('FROM PLATFORMS') || n.includes('FROM PLATFORM_')) return {results:[]};
    return {results:[]};
  }
}

// 1) static syntax
for (const file of ['worker/index.js','docs/app.js','docs/analytics.js','docs/config.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT,file)], {stdio:'inherit'});
  ok(`syntax ${file}`);
}

const packageJson = JSON.parse(await text('package.json'));
if (packageJson.version !== '10.2.1') fail(`package version mismatch: ${packageJson.version}`);
if (packageJson.devDependencies?.wrangler !== '4.145.0') fail(`wrangler version mismatch: ${packageJson.devDependencies?.wrangler}`);
ok('package.json contract');
const worker = await text('worker/index.js');
const schema = await text('db/schema-v9.sql');
const apiSchema = JSON.parse(await text('docs/api-schema.json'));
const eventColumns = parseQuotedArray(worker,'EVENT_COLUMNS');
const platformColumns = parseQuotedArray(worker,'PLATFORM_COLUMNS');
const visitorColumns = parseQuotedArray(worker,'VISITOR_COLUMNS');
const sessionColumns = parseQuotedArray(worker,'SESSION_COLUMNS');
const expectedEvent = extractTableColumns(schema,'events');
const expectedPlatform = extractTableColumns(schema,'platforms');
const expectedVisitor = extractTableColumns(schema,'platform_visitors');
const expectedSession = extractTableColumns(schema,'platform_sessions');
if (JSON.stringify(eventColumns)!==JSON.stringify(expectedEvent)) fail('EVENT_COLUMNS differs from schema');
if (JSON.stringify(platformColumns)!==JSON.stringify(expectedPlatform)) fail('PLATFORM_COLUMNS differs from schema');
if (JSON.stringify(visitorColumns)!==JSON.stringify(expectedVisitor)) fail('VISITOR_COLUMNS differs from schema');
if (JSON.stringify(sessionColumns)!==JSON.stringify(expectedSession)) fail('SESSION_COLUMNS differs from schema');
if (eventColumns.length !== 96) fail(`events has ${eventColumns.length} columns`);
ok(`schema/worker column alignment events=${eventColumns.length}, platforms=${platformColumns.length}, visitors=${visitorColumns.length}, sessions=${sessionColumns.length}`);

// 2) execute complete schema + console DDL with SQLite
const tempDir = await fs.mkdtemp('/tmp/uei-validate-');
const dbFile = path.join(tempDir,'schema.sqlite');
execFileSync('python3',['-c',`
import sqlite3, pathlib
root=pathlib.Path(${JSON.stringify(ROOT)})
con=sqlite3.connect(${JSON.stringify(dbFile)})
con.executescript((root/'db/schema-v9.sql').read_text())
for f in sorted((root/'db/console').glob('*.sql')):
    if f.name.startswith('4') or f.name.startswith('5'):
        continue
    con.executescript(f.read_text())
print('sqlite console DDL: ok')
`], {stdio:'inherit'});
ok('schema + console DDL executes in SQLite');

// 3) runtime-like Worker collect path with bind validation
const mod = await import(path.join(ROOT,'worker/index.js'));
const db = new MockD1(eventColumns, platformColumns, visitorColumns, sessionColumns);
const env = {
  DB: db,
  GITHUB_ARCHIVE_ENABLED: 'false',
  TELEGRAM_ENABLED: 'false',
  REQUIRE_PLATFORM_KEY: 'false'
};
const sample = JSON.parse(await text('tests-SAMPLE-EVENT.json'));
const r1 = await mod.default.fetch(new Request('https://worker.example/v1/events',{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'203.0.113.10'},body:JSON.stringify(sample)}),env,{});
const b1 = await r1.json();
if (![201,202].includes(r1.status) || b1.accepted !== true || b1.stored?.d1 !== true) fail(`sample event unexpected response ${r1.status}`);
ok('sample event collect path stores D1 event and survives disabled archive');
const r2 = await mod.default.fetch(new Request('https://worker.example/v1/events',{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'203.0.113.10'},body:JSON.stringify(sample)}),env,{});
const b2 = await r2.json();
if (r2.status !== 200 || b2.duplicate !== true) fail('duplicate event was not detected');
ok('duplicate event path is idempotent');
const r3 = await mod.default.fetch(new Request('https://worker.example/v1/schema'),env,{});
const b3 = await r3.json();
if (r3.status!==200 || b3.eventColumnCount!==96) fail('schema endpoint mismatch');
ok('schema endpoint reports 96 event columns');
const r4 = await mod.default.fetch(new Request('https://worker.example/v1/health'),env,{});
if (r4.status!==200) fail(`health unexpected status ${r4.status}`);
ok('health endpoint is reachable in runtime mock');
const r5 = await mod.default.fetch(new Request('https://worker.example/v1/platforms/%E0%A4%A'),env,{});
if (r5.status!==400) fail(`malformed encoded platform path expected 400 got ${r5.status}`);
ok('malformed URL encoding returns 400 instead of crashing');

if (!apiSchema || typeof apiSchema !== 'object') fail('api schema missing');
ok('API schema JSON loaded');

console.log(`\nVALIDATION COMPLETE — worker=10.2.1, schema=9.0, events=${eventColumns.length}, runtime smoke tests=PASS`);
