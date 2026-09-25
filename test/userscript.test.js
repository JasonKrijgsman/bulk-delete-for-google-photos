'use strict';

// The userscript is extension/remover.js with a userscript header on top.
// scripts/build-userscript.mjs writes it. These tests fail when the committed
// file is not what that script writes, or when its header is wrong. To fix
// the first: npm run build:userscript

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const userscriptPath = path.join(root, 'userscript', 'bulk-delete-for-google-photos.user.js');
const REPO = 'https://github.com/JasonKrijgsman/bulk-delete-for-google-photos';
const LATEST = REPO + '/releases/latest/download/bulk-delete-for-google-photos.user.js';

// Git can check text files out with CRLF line endings. Those are not content.
const lf = (text) => text.replace(/\r\n/g, '\n');

function read(file) {
  return lf(fs.readFileSync(file, 'utf8'));
}

function firstDifference(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) {
      return 'line ' + (i + 1) + ': committed ' + JSON.stringify(x[i]) + ', built ' + JSON.stringify(y[i]);
    }
  }
  return 'none';
}

// Reads the "// @key value" lines between the userscript markers.
function parseHeader(text) {
  const match = /^\/\/ ==UserScript==\n([\s\S]*?)\n\/\/ ==\/UserScript==\n/.exec(text);
  assert.ok(match, 'the file starts with a ==UserScript== header');
  const fields = {};
  match[1].split('\n').forEach((line) => {
    const field = /^\/\/ @([\w-]+)(?:\s+(.*))?$/.exec(line);
    assert.ok(field, 'header line: ' + line);
    (fields[field[1]] = fields[field[1]] || []).push((field[2] || '').trim());
  });
  return { fields: fields, body: text.slice(match[0].length) };
}

test('the committed userscript is exactly what the build script writes', async () => {
  const build = await import(pathToFileURL(path.join(root, 'scripts', 'build-userscript.mjs')).href);
  assert.ok(fs.existsSync(userscriptPath), 'the userscript is missing. Run: npm run build:userscript');
  const committed = read(userscriptPath);
  const built = lf(build.buildUserscript());
  assert.ok(committed === built,
    'the userscript is out of date. Run: npm run build:userscript. First difference at ' +
    firstDifference(committed, built));
});

test('the userscript header names the script, its version and its pages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  const { fields } = parseHeader(read(userscriptPath));
  const one = (key) => {
    assert.equal((fields[key] || []).length, 1, '@' + key + ' appears once');
    return fields[key][0];
  };
  assert.equal(one('name'), 'Bulk Delete for Google Photos');
  assert.equal(one('name'), manifest.name);
  assert.equal(one('namespace'), REPO);
  assert.equal(one('version'), manifest.version);
  assert.equal(one('description'), manifest.description);
  assert.deepEqual(fields.match, ['https://photos.google.com/*']);
  assert.equal(one('run-at'), 'document-idle');
  assert.equal(one('noframes'), '');
  assert.equal(one('license'), 'MIT');
  assert.equal(one('homepageURL'), REPO);
  assert.equal(one('supportURL'), REPO + '/issues');
  assert.match(one('icon'), /^https:\/\/raw\.githubusercontent\.com\/JasonKrijgsman\/bulk-delete-for-google-photos\/main\/extension\/icons\/icon\d+\.png$/);
  assert.ok(fs.existsSync(path.join(root, one('icon').split('/main/')[1])), 'the icon file exists');
  assert.equal(one('downloadURL'), LATEST);
  assert.equal(one('updateURL'), LATEST);
});

// @require and @resource would load code or files from elsewhere, @connect
// would allow cross-site requests and @include could widen the pages.
test('the userscript asks for no rights, loads no other code and runs on no other page', () => {
  const { fields } = parseHeader(read(userscriptPath));
  assert.deepEqual(fields.grant, ['none']);
  ['require', 'resource', 'connect', 'include']
    .forEach((key) => assert.equal(fields[key], undefined, '@' + key + ' is not in the header'));
});

test('the userscript body is remover.js, unchanged, and runs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  const { body } = parseHeader(read(userscriptPath));
  assert.ok(body === '\n' + read(path.join(root, 'extension', 'remover.js')),
    'the body after the header is a blank line and then remover.js');
  const api = require(userscriptPath);
  assert.equal(api.VERSION, manifest.version);
  assert.equal(typeof api.mountPanel, 'function');
});
