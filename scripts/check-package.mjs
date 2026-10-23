import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf8'));
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [pack] = JSON.parse(execFileSync(command, ['pack', '--dry-run', '--ignore-scripts', '--json'], { encoding: 'utf8' }));
const files = pack.files.map(({ path }) => path);
assert.equal(pkg.name, '@cogine-ai/openclaw-lark');
assert.equal(pkg.publishConfig.access, 'public');
assert.equal(pkg.openclaw.install.npmSpec, pkg.name);
assert.equal(manifest.id, 'openclaw-lark');
assert.equal(manifest.contracts.tools.length, 39);
assert.equal(new Set(manifest.contracts.tools).size, 39);
for (const required of ['dist/index.mjs', 'dist/index.d.mts', 'dist/secret-contract-api.mjs', 'secret-contract-api.js', 'openclaw.plugin.json', 'LICENSE', 'NOTICE', 'README.md']) {
  assert(files.includes(required), `Missing packed file: ${required}`);
}
for (const file of files) {
  assert(/^(dist\/|skills\/|package\.json$|openclaw\.plugin\.json$|secret-contract-api\.js$|README\.md$|LICENSE$|NOTICE$|CHANGELOG\.md$)/.test(file), `Unexpected packed file: ${file}`);
  assert(!/(^|\/)(\.env|credentials|pilot-logs|node_modules)(\/|$)/.test(file), `Private path in package: ${file}`);
}
const { default: plugin } = await import('../dist/index.mjs');
const tools = [];
const noop = () => {};
plugin.register({
  runtime: {},
  config: { channels: { feishu: { enabled: true, appId: 'fixture-app', appSecret: 'fixture-not-a-secret' } } },
  logger: { info: noop, warn: noop, error: noop, debug: noop },
  registerChannel: noop, registerCli: noop, registerCommand: noop, on: noop,
  registerTool(tool, opts) { tools.push(typeof tool === 'function' ? opts?.name : tool.name); },
});
assert.deepEqual([...tools].sort(), [...manifest.contracts.tools].sort(), 'Built registrations must match manifest contracts');
console.log(JSON.stringify({ name: pkg.name, version: pkg.version, files: files.length, unpackedSize: pack.unpackedSize, toolContracts: 39, passed: true }, null, 2));
