'use strict';

// Runs the real runner and DOM adapter against test/fixture/photos.html in
// headless Chrome. The fixture copies the structure of the Google Photos
// library page; it cannot prove that Google has not changed its page since.
// Skipped when Chrome is not installed; set CHROME_PATH to point at it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function unescapeHtml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

const chrome = findChrome();

test('the runner passes every fixture scenario in headless Chrome',
  { skip: chrome ? false : 'Chrome not found; set CHROME_PATH', timeout: 240000 }, () => {
    const fixture = path.join(__dirname, 'fixture', 'photos.html');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fpr-chrome-'));
    try {
      const args = [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--user-data-dir=' + profile, '--window-size=1400,1000',
        '--virtual-time-budget=600000', '--dump-dom', pathToFileURL(fixture).href
      ];
      if (process.platform === 'linux') args.unshift('--no-sandbox');
      // Chrome misbehaves when started from a very long working directory.
      const run = spawnSync(chrome, args, {
        cwd: os.tmpdir(), encoding: 'utf8', timeout: 200000, maxBuffer: 64 * 1024 * 1024
      });
      assert.equal(run.error, undefined, String(run.error));
      const match = /<pre id="result">([\s\S]*?)<\/pre>/.exec(run.stdout || '');
      assert.ok(match, 'no result in the page. stderr: ' + String(run.stderr || '').slice(-2000));
      const text = unescapeHtml(match[1]);
      assert.notEqual(text, 'pending', 'the scenarios did not finish inside the virtual time budget');
      const results = JSON.parse(text);
      const failed = results.filter((r) => !r.ok);
      assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
      assert.ok(results.length >= 8, 'ran ' + results.length + ' scenarios');
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
