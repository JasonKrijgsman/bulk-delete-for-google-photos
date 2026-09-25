'use strict';

// Unit tests for the procedure. A fake library stands in for the page, so
// these run in Node without a browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FPR = require('../extension/remover.js');

const TRASH = { kind: 'trash' };
const CONFIRM = { kind: 'confirm' };
const DIALOG = { kind: 'dialog' };

// Timings that make every wait instant, with polling budgets that still
// cover the one-second stability checks.
const FAST = {
  sleep: async () => {},
  clickDelay: 0,
  settleDelay: 0,
  poll: 10,
  stepTimeout: 5000,
  trashTimeout: 5000,
  pauseBetweenBatches: 0
};

function fakeLibrary(options) {
  const o = Object.assign({
    total: 50,
    viewport: 12,
    step: 8,
    askFirst: true,
    trashFound: true,
    confirmFound: true,
    failTrash: false,
    extraSelected: 0,
    page: { ok: true, kind: 'library' },
    modal: false
  }, options);
  const photos = Array.from({ length: o.total }, (_, i) => 'p' + i);
  const selected = new Set();
  const learned = {};
  const stats = { clicks: {}, trashClicks: 0, confirmClicks: 0, maxSelected: 0, escapes: 0 };
  let pos = 0;
  let dialogOpen = false;

  function moveSelectedToTrash() {
    if (!o.failTrash) {
      for (let i = photos.length - 1; i >= 0; i--) {
        if (selected.has(photos[i])) photos.splice(i, 1);
      }
    }
    selected.clear();
    dialogOpen = false;
  }

  const adapter = {
    page: () => o.page,
    modalOpen: () => o.modal,
    account: () => 'someone@example.com',
    tiles: () => photos.slice(pos, pos + o.viewport)
      .map((id) => ({ id, checkbox: { photo: id }, checked: selected.has(id) })),
    click: (el) => {
      if (el.photo) {
        stats.clicks[el.photo] = (stats.clicks[el.photo] || 0) + 1;
        if (selected.has(el.photo)) selected.delete(el.photo);
        else selected.add(el.photo);
        if (o.extraSelected && selected.size === 1) {
          photos.slice(-o.extraSelected).forEach((id) => selected.add(id));
        }
        stats.maxSelected = Math.max(stats.maxSelected, selected.size);
      } else if (el === TRASH) {
        stats.trashClicks++;
        if (o.askFirst) dialogOpen = true;
        else moveSelectedToTrash();
      } else if (el === CONFIRM) {
        stats.confirmClicks++;
        moveSelectedToTrash();
      }
      return true;
    },
    scrollToTop: () => { pos = 0; },
    scrollDown: () => {
      const max = Math.max(0, photos.length - o.viewport);
      const next = Math.min(max, pos + o.step);
      const moved = next > pos;
      pos = next;
      return moved;
    },
    findTrashButton: () => (selected.size && (o.trashFound || learned.trash) ? TRASH : null),
    inSelectionMode: () => selected.size > 0,
    selectionCount: () => (selected.size ? selected.size : null),
    dialogs: () => (dialogOpen ? [DIALOG] : []),
    isOpen: (d) => d === DIALOG && dialogOpen,
    findConfirmButton: () => (o.confirmFound || learned.confirm ? CONFIRM : null),
    buttonLabels: () => ['Cancel', 'Move to trash'],
    labelOf: (el) => (el === TRASH || el === CONFIRM ? 'Move to trash' : ''),
    pressEscape: () => {
      stats.escapes++;
      if (dialogOpen) dialogOpen = false;
      else selected.clear();
    },
    clearSelection: () => { selected.clear(); },
    anyPresent: (ids) => ids.some((id) => photos.slice(pos, pos + o.viewport).includes(id)),
    useLabel: (kind, label) => { learned[kind] = label; },
    remember: (kind, label) => { learned[kind] = label; learned['saved_' + kind] = label; },
    hasLearned: () => false,
    forget: () => {}
  };
  return { adapter, photos, selected, stats, learned, isDialogOpen: () => dialogOpen };
}

function runnerFor(lib, options) {
  return FPR.createRunner(lib.adapter, Object.assign({}, FAST, options));
}

test('parseCount reads the number in the selection label', () => {
  assert.equal(FPR.parseCount('1 geselecteerd'), 1);
  assert.equal(FPR.parseCount('250 selected'), 250);
  assert.equal(FPR.parseCount('1.234 geselecteerd'), 1234);
  assert.equal(FPR.parseCount('2,500 selected'), 2500);
  assert.equal(FPR.parseCount('12 345 sélectionnés'), 12345);
  assert.equal(FPR.parseCount('nothing here'), null);
});

test('parseLimit: empty means all, and a typo never means all', () => {
  assert.equal(FPR.parseLimit(''), Infinity);
  assert.equal(FPR.parseLimit('   '), Infinity);
  assert.equal(FPR.parseLimit('500'), 500);
  assert.equal(FPR.parseLimit(' 7 '), 7);
  assert.equal(FPR.parseLimit('0'), null);
  assert.equal(FPR.parseLimit('-3'), null);
  assert.equal(FPR.parseLimit('12a'), null);
  assert.equal(FPR.parseLimit('1.5'), null);
});

test('the trash words match trash buttons and never Cancel or other actions', () => {
  const trash = ['Naar prullenbak', 'Move to trash', 'Move to bin', 'In den Papierkorb verschieben',
    'Placer dans la corbeille', 'Mover a la papelera', 'Sposta nel cestino', 'Przenieś do kosza',
    'Переместить в корзину', 'ゴミ箱に移動', 'Çöp kutusuna taşı'];
  const other = ['Annuleren', 'Cancel', 'Delen', 'Share', 'Selectie wissen', 'Clear selection',
    'Maken of toevoegen aan album', 'Combine', "Foto's bestellen", 'Google-account: Someone (someone@example.com)'];
  trash.forEach((label) => assert.ok(FPR.TRASH_WORDS.test(label), label));
  other.forEach((label) => assert.ok(!FPR.TRASH_WORDS.test(label), label));
});

test('moves exactly the requested number, in batches no larger than asked', async () => {
  const lib = fakeLibrary({ total: 100 });
  const res = await runnerFor(lib, { batchSize: 3 }).run(7);
  assert.equal(res.trashed, 7);
  assert.equal(res.reason, 'limit');
  assert.equal(res.batches, 3);
  assert.equal(lib.photos.length, 93);
  assert.ok(lib.stats.maxSelected <= 3, 'selected ' + lib.stats.maxSelected + ' at once');
  assert.deepEqual(lib.photos.slice(0, 2), ['p7', 'p8'], 'works from the top down');
});

test('moves everything when there is no limit, scrolling as it goes', async () => {
  const lib = fakeLibrary({ total: 45, viewport: 10, step: 7 });
  const res = await runnerFor(lib, { batchSize: 20 }).run(Infinity);
  assert.equal(res.trashed, 45);
  assert.equal(res.reason, 'empty');
  assert.equal(lib.photos.length, 0);
});

test('never clicks the same photo twice', async () => {
  const lib = fakeLibrary({ total: 30, viewport: 10, step: 3 });
  const res = await runnerFor(lib, { batchSize: 30 }).run(Infinity);
  assert.equal(res.trashed, 30);
  assert.ok(Object.values(lib.stats.clicks).every((n) => n === 1), JSON.stringify(lib.stats.clicks));
});

test('refuses to start on a page it does not support', async () => {
  const lib = fakeLibrary({ page: { ok: false, reason: 'unsupported-page' } });
  await assert.rejects(runnerFor(lib).run(5), { code: 'unsupported-page' });
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(Object.keys(lib.stats.clicks).length, 0);
});

test('refuses to start while a Google pop-up is open', async () => {
  const lib = fakeLibrary({ modal: true });
  await assert.rejects(runnerFor(lib).run(5), { code: 'close-popup' });
  assert.equal(Object.keys(lib.stats.clicks).length, 0);
});

test('stops without moving anything when Google selects more than planned', async () => {
  const lib = fakeLibrary({ total: 40, extraSelected: 5 });
  await assert.rejects(runnerFor(lib, { batchSize: 10 }).run(10), { code: 'too-many' });
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(lib.photos.length, 40);
  assert.equal(lib.selected.size, 0, 'the selection is cleared');
});

test('works when Google moves the photos without asking first', async () => {
  const lib = fakeLibrary({ total: 15, askFirst: false });
  const res = await runnerFor(lib, { batchSize: 50 }).run(Infinity);
  assert.equal(res.trashed, 15);
  assert.equal(lib.stats.confirmClicks, 0);
  assert.equal(lib.photos.length, 0);
});

test('reports it when Google does not remove the photos', async () => {
  const lib = fakeLibrary({ total: 20, failTrash: true });
  await assert.rejects(runnerFor(lib, { batchSize: 10 }).run(Infinity),
    (err) => err.code === 'not-removed' && err.trashed === 0);
  assert.equal(lib.photos.length, 20);
});

test('backs out of the dialog when it cannot find the confirm button', async () => {
  const lib = fakeLibrary({ total: 20, confirmFound: false });
  await assert.rejects(runnerFor(lib).run(5), { code: 'no-confirm-button' });
  assert.equal(lib.stats.confirmClicks, 0);
  assert.equal(lib.photos.length, 20);
  assert.equal(lib.isDialogOpen(), false, 'the dialog is closed');
  assert.equal(lib.selected.size, 0, 'the selection is cleared');
});

test('stop ends the run after the current batch', async () => {
  const lib = fakeLibrary({ total: 50 });
  let runner = null;
  runner = runnerFor(lib, {
    batchSize: 5,
    onProgress: (s) => { if (s.phase === 'batch-done' && s.batches === 1) runner.stop(); }
  });
  const res = await runner.run(Infinity);
  assert.equal(res.reason, 'stopped');
  assert.equal(res.trashed, 5);
  assert.equal(lib.photos.length, 45);
  assert.equal(lib.selected.size, 0);
});

test('learns unknown trash and confirm buttons from one click each', async () => {
  const lib = fakeLibrary({ total: 12, trashFound: false, confirmFound: false });
  const asked = [];
  const teach = async (kind) => {
    asked.push(kind);
    lib.adapter.click(kind === 'trash' ? TRASH : CONFIRM); // the user clicks the real button
    return 'Move to trash';
  };
  const res = await runnerFor(lib, { batchSize: 5, teach }).run(Infinity);
  assert.equal(res.trashed, 12);
  assert.deepEqual(asked, ['trash', 'confirm'], 'asks once, then uses what it learned');
  assert.equal(lib.learned.saved_trash, 'Move to trash');
  assert.equal(lib.learned.saved_confirm, 'Move to trash');
});

test('does not remember a taught button when that batch failed', async () => {
  const lib = fakeLibrary({ total: 12, trashFound: false, confirmFound: false, failTrash: true });
  const teach = async (kind) => {
    lib.adapter.click(kind === 'trash' ? TRASH : CONFIRM);
    return 'Move to trash';
  };
  await assert.rejects(runnerFor(lib, { batchSize: 5, teach }).run(Infinity), { code: 'not-removed' });
  assert.equal(lib.learned.saved_trash, undefined);
  assert.equal(lib.learned.saved_confirm, undefined);
});

test('a second run while one is busy is refused', async () => {
  const lib = fakeLibrary({ total: 10 });
  const runner = runnerFor(lib, { batchSize: 5 });
  const first = runner.run(Infinity);
  await assert.rejects(runner.run(Infinity), { code: 'busy' });
  await first;
});

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'extension', 'remover.js'), 'utf8');

test('version numbers agree', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.version, FPR.VERSION);
  assert.equal(pkg.version, FPR.VERSION);
});

test('the extension asks for no permissions and runs only on Google Photos', () => {
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://photos.google.com/*']);
  Object.values(manifest.icons).forEach((icon) => {
    assert.ok(fs.existsSync(path.join(root, 'extension', icon)), icon + ' exists');
  });
});

test('the script makes no network requests and builds no HTML from strings', () => {
  ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts',
    'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']
    .forEach((needle) => assert.ok(!source.includes(needle), 'remover.js contains ' + needle));
});

test('the script never goes near the trash page itself', () => {
  const pageCheck = FPR.createDomAdapter({}, { location: { pathname: '/' } }, FPR.createStore(null), { path: '/trash' });
  assert.deepEqual(pageCheck.page(), { ok: false, reason: 'unsupported-page' });
  const paths = { '/': 'library', '/u/1/': 'library', '/u/2': 'library', '/archive': 'archive', '/u/1/archive/': 'archive' };
  Object.keys(paths).forEach((p) => {
    const a = FPR.createDomAdapter({}, {}, FPR.createStore(null), { path: p });
    assert.deepEqual(a.page(), { ok: true, kind: paths[p] }, p);
  });
  ['/photo/AF1Qip', '/albums', '/search/cats', '/trash', '/u/1/trash', '/lockedfolder'].forEach((p) => {
    const a = FPR.createDomAdapter({}, {}, FPR.createStore(null), { path: p });
    assert.equal(a.page().ok, false, p);
  });
});
