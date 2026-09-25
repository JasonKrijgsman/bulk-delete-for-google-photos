#!/usr/bin/env node
// Renders every image for the website and the Chrome Web Store listing:
//
//   docs/images/panel-idle.png, panel-confirm.png, panel-running.png,
//   panel-done.png                                                 (2x, transparent)
//   docs/images/og.png                                             (1200 by 630)
//   store/screenshot-1.png to screenshot-3.png                     (1280 by 800)
//   store/promo-small.png                                          (440 by 280)
//
// It also copies the icons: docs/favicon.png and docs/images/icon-128.png.
//
// Run it from anywhere:   node scripts/render-images.mjs
//
// The pictures come from scripts/render/demo.html, a made-up photo library
// with gradient tiles and the real panel from extension/remover.js, opened in
// headless Chrome. Nothing is fetched from the network and no real photos are
// used. Each run checks what the panel says before it writes an image.
//
// CHROME_PATH   Chrome or Chromium to use, when it is not in a standard place.
// RENDER_JOBS   how many Chrome processes run at once (default 3).
// RENDER_TMP    folder for Chrome's temporary profiles (default: the system temp).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng, crop, colourCount, edgeAlpha } from './render/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARD = path.join(ROOT, 'scripts', 'render', 'card.html');

// Room around the panel in the panel pictures, in CSS pixels. It holds the
// panel's shadow, which reaches 28 px out and 36 px down.
const MARGIN = { left: 32, top: 24, right: 32, bottom: 40 };

const DEMO_SIZE = [1200, 632];
const SHORT = 10000;
const RUNNING = 300000;
const DONE = 900000;

const IDLE_TEXT = ['Account\nyou@example.com', 'Page\nLibrary', 'How many photos', 'Move to trash'];
const CONFIRM_TEXT = ['Move ALL photos from the Library of you@example.com to the trash?', 'Yes, move them', 'Cancel'];
const RUNNING_TEXT = ['Selecting photos. Moved so far: 1,000 (about 7', 'Batch 4: moved 250 photos, 1000 in total.', 'Stop'];
const DONE_TEXT = ['Moved 2,903 photos to the trash in 4 min. Nothing is left in your Library.', 'They stay in the trash for 30 days.'];

const JOBS = [
  { name: 'panel-idle', out: 'docs/images/panel-idle.png', query: { kind: 'panel', state: 'idle' }, size: DEMO_SIZE, scale: 2, transparent: true, budget: SHORT, expect: IDLE_TEXT },
  { name: 'panel-confirm', out: 'docs/images/panel-confirm.png', query: { kind: 'panel', state: 'confirm' }, size: DEMO_SIZE, scale: 2, transparent: true, budget: SHORT, expect: CONFIRM_TEXT },
  { name: 'panel-running', out: 'docs/images/panel-running.png', query: { kind: 'panel', state: 'running' }, size: DEMO_SIZE, scale: 2, transparent: true, budget: RUNNING, expect: RUNNING_TEXT },
  { name: 'panel-done', out: 'docs/images/panel-done.png', query: { kind: 'panel', state: 'done' }, size: DEMO_SIZE, scale: 2, transparent: true, budget: DONE, expect: DONE_TEXT },
  { name: 'screenshot-1', out: 'store/screenshot-1.png', query: { kind: 'store', n: '1' }, size: [1280, 800], scale: 1, budget: SHORT, expect: IDLE_TEXT },
  { name: 'screenshot-2', out: 'store/screenshot-2.png', query: { kind: 'store', n: '2' }, size: [1280, 800], scale: 1, budget: RUNNING, expect: RUNNING_TEXT },
  { name: 'screenshot-3', out: 'store/screenshot-3.png', query: { kind: 'store', n: '3' }, size: [1280, 800], scale: 1, budget: DONE, expect: DONE_TEXT },
  // These two use pictures made above, so they run last.
  { name: 'og', out: 'docs/images/og.png', query: { kind: 'og' }, size: [1200, 630], scale: 1, budget: SHORT, after: true },
  { name: 'promo-small', out: 'store/promo-small.png', query: { kind: 'promo' }, size: [440, 280], scale: 1, budget: SHORT, after: true }
];

const ICONS = [
  ['extension/icons/icon32.png', 'docs/favicon.png'],
  ['extension/icons/icon128.png', 'docs/images/icon-128.png']
];

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
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
}

// Starts one headless Chrome. It writes the screenshot and prints the DOM when
// the virtual time budget runs out.
function runChrome(chrome, job, dir) {
  const shot = path.join(dir, 'shot.png');
  const url = pathToFileURL(CARD).href + '?' + new URLSearchParams(job.query).toString();
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--user-data-dir=' + path.join(dir, 'p'),
    '--window-size=' + job.size.join(','), '--force-device-scale-factor=' + job.scale,
    '--virtual-time-budget=' + job.budget, '--dump-dom', '--screenshot=' + shot
  ];
  if (job.transparent) args.push('--default-background-color=00000000');
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  args.push(url);
  return new Promise((resolve) => {
    const started = Date.now();
    // Chrome misbehaves when started from a very long working directory.
    const child = spawn(chrome, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, shot, seconds: Math.round((Date.now() - started) / 1000) });
    });
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function render(chrome, job, work) {
  let run = null;
  let raw = '';
  // A busy machine can let the virtual clock run out before the page is
  // ready. Then the status still says "pending", and one more try helps.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const dir = path.join(work, 'j' + JOBS.indexOf(job) + '-' + attempt);
    fs.mkdirSync(dir, { recursive: true });
    run = await runChrome(chrome, job, dir);
    const match = /<pre id="status"[^>]*>([\s\S]*?)<\/pre>/.exec(run.stdout);
    raw = match ? unescapeHtml(match[1]) : '';
    if (raw && raw !== 'pending') break;
    if (attempt === 1) console.log('retry   ' + job.name + ': the page was not ready in time');
  }
  check(raw && raw !== 'pending', job.name + ': the page did not finish. Chrome said: ' + run.stderr.slice(-600));
  const status = JSON.parse(raw);
  check(fs.existsSync(run.shot), job.name + ': Chrome wrote no screenshot');
  let image = decodePng(fs.readFileSync(run.shot));
  check(image.width === job.size[0] * job.scale && image.height === job.size[1] * job.scale,
    job.name + ': the screenshot is ' + image.width + 'x' + image.height);

  if (status.demo) {
    const text = status.demo.text;
    (job.expect || []).forEach((phrase) => {
      check(text.includes(phrase), job.name + ': the panel does not say "' + phrase + '". It says:\n' + text);
    });
  } else {
    check(status.ok, job.name + ': ' + JSON.stringify(status));
  }

  if (job.query.kind === 'panel') {
    const r = status.demo.rect;
    const s = job.scale;
    const x0 = Math.floor((status.frame.x + r.x - MARGIN.left) * s);
    const y0 = Math.floor((status.frame.y + r.y - MARGIN.top) * s);
    const x1 = Math.ceil((status.frame.x + r.x + r.width + MARGIN.right) * s);
    const y1 = Math.ceil((status.frame.y + r.y + r.height + MARGIN.bottom) * s);
    image = crop(image, x0, y0, x1 - x0, y1 - y0);
    check(edgeAlpha(image) <= 3, job.name + ': the panel or its shadow touches the edge of the picture');
  }
  check(colourCount(image) > 40, job.name + ': the picture looks blank');

  const out = path.join(ROOT, job.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const png = encodePng(image);
  fs.writeFileSync(out, png);
  return { name: job.name, out: job.out, width: image.width, height: image.height, kb: Math.round(png.length / 1024), seconds: run.seconds };
}

async function pool(items, limit, worker) {
  const results = [];
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      results.push(await worker(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome not found. Set CHROME_PATH to Chrome or Chromium.');
    process.exit(1);
  }
  const wanted = process.argv.slice(2);
  const jobs = wanted.length ? JOBS.filter((j) => wanted.includes(j.name)) : JOBS;
  if (!jobs.length) {
    console.error('No such image. Choose from: ' + JOBS.map((j) => j.name).join(', '));
    process.exit(1);
  }

  for (const [from, to] of ICONS) {
    fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, from), path.join(ROOT, to));
    console.log('copied  ' + from + ' -> ' + to);
  }

  const limit = Math.max(1, parseInt(process.env.RENDER_JOBS || '3', 10) || 3);
  const work = fs.mkdtempSync(path.join(process.env.RENDER_TMP || os.tmpdir(), 'bdgp-'));
  const report = (r) => console.log('wrote   ' + r.out + '  ' + r.width + 'x' + r.height + ', ' + r.kb + ' KB, ' + r.seconds + ' s');
  try {
    for (const phase of [jobs.filter((j) => !j.after), jobs.filter((j) => j.after)]) {
      await pool(phase, limit, async (job) => {
        const result = await render(chrome, job, work);
        report(result);
        return result;
      });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
