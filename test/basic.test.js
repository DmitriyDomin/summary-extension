const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rootFiles = () =>
  fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

test('every root JavaScript file parses', () => {
  for (const f of rootFiles().filter((n) => n.endsWith('.js'))) {
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }),
      `${f} has a syntax error`
    );
  }
});

test('manifest is valid and every referenced file exists', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.strictEqual(manifest.manifest_version, 3);
  const refs = new Set([manifest.background.service_worker, manifest.side_panel.default_path]);
  for (const cs of manifest.content_scripts) (cs.js || []).forEach((f) => refs.add(f));
  Object.values(manifest.icons).forEach((f) => refs.add(f));
  manifest.web_accessible_resources.forEach((r) => r.resources.forEach((f) => refs.add(f)));
  for (const f of refs) assert.ok(fs.existsSync(path.join(root, f)), `manifest references missing file ${f}`);
});

test('all locales define the same message keys as English', () => {
  const keys = (l) => Object.keys(JSON.parse(read(`_locales/${l}/messages.json`))).sort();
  const en = keys('en');
  for (const l of fs.readdirSync(path.join(root, '_locales'))) {
    assert.deepStrictEqual(keys(l), en, `locale ${l} is out of sync with en`);
  }
});

test('no API keys or private webhooks are committed', () => {
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /AIza[0-9A-Za-z_-]{30,}/,
    /AQ\.Ab8[A-Za-z0-9_-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY/,
    /herokuapp\.com\/webhook/,
  ];
  for (const f of rootFiles().filter((n) => /\.(js|html|json|md|css)$/.test(n) && n !== 'package-lock.json')) {
    const text = read(f);
    for (const p of patterns) assert.ok(!p.test(text), `${f} matches secret pattern ${p}`);
  }
});

test('content scripts load the shared helpers they use, in the right order', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const needs = [
    ['SummaryUtils', 'summary-utils.js'],
    ['ApiErrors', 'api-errors.js'],
    ['apiService', 'api-service.js'],
    ['generateSecureSummary', 'secure-api.js'],
  ];
  for (const cs of manifest.content_scripts) {
    const files = cs.js || [];
    files.forEach((file, index) => {
      const source = read(file);
      for (const [symbol, provider] of needs) {
        if (file === provider || !new RegExp(`\\b${symbol}\\b`).test(source)) continue;
        const at = files.indexOf(provider);
        assert.ok(at !== -1 && at < index, `${file} uses ${symbol} but ${provider} is not loaded before it for ${cs.matches[0]}`);
      }
    });
  }
});

test('the YouTube bridge runs in the page world at document start', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const bridge = manifest.content_scripts.find((cs) => (cs.js || []).includes('yt-main-bridge.js'));
  assert.ok(bridge);
  assert.strictEqual(bridge.world, 'MAIN');
  assert.strictEqual(bridge.run_at, 'document_start');
});
