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
// cover the stability checks.
const FAST = {
  sleep: async () => {},
  clickDelay: 0,
  settleDelay: 0,
  poll: 10,
  stepTimeout: 5000,
  barTimeout: 5000,
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
    ghostSelected: 0,
    countReadable: true,
    page: { ok: true, kind: 'library' },
    modal: false,
    account: 'someone@example.com',
    barLatePolls: 0,
    hiddenPolls: 0,
    hideAfterClicks: 0,
    hideFor: 0,
    blankPollsAfterTrash: 0,
    unsafeDialog: false,
    confirmNoEffect: false,
    barNeverDrawn: false
  }, options);
  const photos = Array.from({ length: o.total }, (_, i) => 'p' + i);
  const selected = new Set();
  const learned = {};
  const stats = { clicks: {}, trashClicks: 0, confirmClicks: 0, maxSelected: 0, escapes: 0, cancels: 0 };
  let pos = 0;
  let dialogOpen = false;
  let barPollsLeft = o.barLatePolls;
  let hiddenLeft = o.hiddenPolls;
  let tileClicks = 0;
  let blankLeft = 0;
  let where = '/';
  let account = o.account;

  function moveSelectedToTrash() {
    if (!o.failTrash) {
      for (let i = photos.length - 1; i >= 0; i--) {
        if (selected.has(photos[i])) photos.splice(i, 1);
      }
    }
    selected.clear();
    dialogOpen = false;
    blankLeft = o.blankPollsAfterTrash;
  }

  const adapter = {
    page: () => o.page,
    place: () => ({ ok: o.page.ok, kind: o.page.kind || null, path: where, account }),
    samePlace: (p) => !!p && o.page.ok && p.path === where && (!p.account || !account || p.account === account),
    account: () => account,
    isHidden: () => {
      if (hiddenLeft > 0) { hiddenLeft--; return true; }
      return false;
    },
    modalOpen: () => o.modal,
    tiles: () => {
      if (blankLeft > 0) { blankLeft--; return []; }
      return photos.slice(pos, pos + o.viewport)
        .map((id) => ({ id, checkbox: { photo: id }, checked: selected.has(id) }));
    },
    click: (el) => {
      if (el.photo) {
        stats.clicks[el.photo] = (stats.clicks[el.photo] || 0) + 1;
        if (selected.has(el.photo)) selected.delete(el.photo);
        else selected.add(el.photo);
        if (o.extraSelected && selected.size === 1) {
          photos.slice(-o.extraSelected).forEach((id) => selected.add(id));
        }
        stats.maxSelected = Math.max(stats.maxSelected, selected.size);
        tileClicks++;
        // hideAfterClicks: the tab goes to the background right after ticking.
        if (o.hideAfterClicks && tileClicks === o.hideAfterClicks) hiddenLeft = o.hideFor;
      } else if (el === TRASH) {
        stats.trashClicks++;
        if (o.askFirst) dialogOpen = true;
        else moveSelectedToTrash();
      } else if (el === CONFIRM) {
        stats.confirmClicks++;
        // confirmNoEffect: the dialog closes, but nothing moves.
        if (o.confirmNoEffect) dialogOpen = false;
        else moveSelectedToTrash();
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
    // While the tab is hidden, or when the bar is never drawn, there is no
    // selection bar to find.
    findTrashButton: () => {
      if (!selected.size || hiddenLeft > 0 || o.barNeverDrawn) return null;
      if (barPollsLeft > 0) { barPollsLeft--; return null; } // the bar is still sliding in
      return o.trashFound || learned.trash ? TRASH : null;
    },
    markBaseline: () => {},
    inSelectionMode: () => selected.size > 0 && !o.barNeverDrawn,
    selectionCount: () => (o.countReadable && selected.size && hiddenLeft === 0 && !o.barNeverDrawn
      ? selected.size + o.ghostSelected : null),
    dialogs: () => (dialogOpen ? [DIALOG] : []),
    isOpen: (d) => d === DIALOG && dialogOpen,
    dialogForbidden: () => o.unsafeDialog,
    findConfirmButton: () => (o.confirmFound || learned.confirm ? CONFIRM : null),
    buttonLabels: () => ['Cancel', 'Move to trash'],
    labelOf: (el) => (el === TRASH || el === CONFIRM ? 'Move to trash' : ''),
    pressEscape: () => {
      stats.escapes++;
      if (dialogOpen) dialogOpen = false;
      else selected.clear();
    },
    cancelDialog: () => {
      stats.cancels++;
      dialogOpen = false;
    },
    clearSelection: () => { if (!o.barNeverDrawn) selected.clear(); },
    anyPresent: (ids) => ids.some((id) => photos.slice(pos, pos + o.viewport).includes(id)),
    useLabel: (kind, label) => { learned[kind] = label; },
    remember: (kind, label) => { learned[kind] = label; learned['saved_' + kind] = label; },
    hasLearned: () => false,
    forget: () => {}
  };
  return {
    adapter, photos, selected, stats, learned,
    isDialogOpen: () => dialogOpen,
    navigate: (p) => { where = p; },
    switchAccount: (a) => { account = a; }
  };
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
  ['0', '-3', '12a', '1.5', '5-', '1e3', '0x10'].forEach((text) => assert.equal(FPR.parseLimit(text), null, text));
});

test('the trash words match trash buttons and never Cancel or other actions', () => {
  const trash = ['Naar prullenbak', 'Move to trash', 'Move to bin', 'In den Papierkorb verschieben',
    'Placer dans la corbeille', 'Mover a la papelera', 'Sposta nel cestino', 'Przenieś do kosza',
    'Переместить в корзину', 'ゴミ箱に移動', 'Çöp kutusuna taşı'];
  const other = ['Annuleren', 'Cancel', 'Delen', 'Share', 'Selectie wissen', 'Clear selection',
    'Maken of toevoegen aan album', 'Combine', "Foto's bestellen", 'Weggooien'];
  trash.forEach((label) => assert.ok(FPR.TRASH_WORDS.test(label), label));
  other.forEach((label) => assert.ok(!FPR.TRASH_WORDS.test(label), label));
});

test('buttons that empty the trash or delete for good are recognised, the normal ones are not', () => {
  const forbidden = ['Empty trash', 'Prullenbak leegmaken', 'Definitief verwijderen', 'Papierkorb leeren',
    'Endgültig löschen', 'Vider la corbeille', 'Supprimer définitivement', 'Vaciar papelera',
    'Eliminar definitivamente', 'Svuota cestino', 'Esvaziar lixeira', 'Opróżnij kosz', 'Delete permanently',
    'Очистить корзину', 'ゴミ箱を空にする', '휴지통 비우기', '清空回收站', 'Tyhjennä roskakori',
    'Dọn sạch thùng rác', 'Delete forever?'];
  // Emptying words alone are fine: in some languages "Clear selection" uses one.
  const allowed = ['Naar prullenbak', 'Weggooien', 'Move to trash', 'Annuleren', 'Selectie wissen',
    'Clear selection', 'Delen', 'Meer opties', 'In den Papierkorb verschieben', 'Placer dans la corbeille',
    'Tyhjennä valinta', 'Очистить выбор', 'ล้างการเลือก'];
  forbidden.forEach((label) => assert.ok(FPR.forbidden(label), label));
  allowed.forEach((label) => assert.ok(!FPR.forbidden(label), label));
  const realDutchDialog = "Verwijderen uit je Google-account, apparaten waarop back-up aanstaat en plekken waar je ze hebt gedeeld binnen Google Foto's? Er komt dan 72,4 MB vrij in de opslag in je Google-account. Annuleren Weggooien";
  assert.ok(!FPR.forbidden(realDutchDialog), 'the real Dutch trash dialog is allowed');
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

test('refuses limits that are not a positive whole number or Infinity', async () => {
  const lib = fakeLibrary({ total: 10 });
  for (const limit of [0, -1, 2.5, NaN, null, undefined, '5']) {
    await assert.rejects(runnerFor(lib).run(limit), { code: 'bad-limit' }, String(limit));
  }
  assert.equal(Object.keys(lib.stats.clicks).length, 0);
});

test('refuses to start on a page it does not support', async () => {
  const lib = fakeLibrary({ page: { ok: false, reason: 'unsupported-page' } });
  await assert.rejects(runnerFor(lib).run(5), { code: 'unsupported-page' });
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(Object.keys(lib.stats.clicks).length, 0);
});

test('refuses to start when it cannot see the account', async () => {
  const lib = fakeLibrary({ account: null });
  await assert.rejects(runnerFor(lib).run(5), { code: 'no-account' });
  assert.equal(Object.keys(lib.stats.clicks).length, 0);
});

test('refuses to run anywhere but the place the user confirmed', async () => {
  const lib = fakeLibrary({});
  const confirmed = { ok: true, kind: 'archive', path: '/archive', account: 'someone@example.com' };
  await assert.rejects(runnerFor(lib).run(5, confirmed), { code: 'page-changed' });
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

test('stops when Google counts more than this batch ticked, even under the limit', async () => {
  const lib = fakeLibrary({ total: 5, ghostSelected: 3 });
  await assert.rejects(runnerFor(lib, { batchSize: 20 }).run(20), { code: 'too-many' });
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(lib.photos.length, 5);
});

test('stops without moving anything when the count cannot be read', async () => {
  const lib = fakeLibrary({ total: 20, countReadable: false });
  await assert.rejects(runnerFor(lib, { batchSize: 10 }).run(10), { code: 'no-count' });
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(lib.photos.length, 20);
  assert.equal(lib.selected.size, 0);
});

test('stops when the page changes between batches', async () => {
  const lib = fakeLibrary({ total: 50 });
  const runner = runnerFor(lib, {
    batchSize: 5,
    onProgress: (s) => { if (s.phase === 'batch-done' && s.batches === 1) lib.navigate('/archive'); }
  });
  await assert.rejects(runner.run(Infinity), (err) => err.code === 'page-changed' && err.trashed === 5);
  assert.equal(lib.photos.length, 45);
  assert.equal(lib.stats.trashClicks, 1);
});

test('stops when the account changes between batches', async () => {
  const lib = fakeLibrary({ total: 50 });
  const runner = runnerFor(lib, {
    batchSize: 5,
    onProgress: (s) => { if (s.phase === 'batch-done' && s.batches === 1) lib.switchAccount('other@example.com'); }
  });
  await assert.rejects(runner.run(Infinity), { code: 'page-changed' });
  assert.equal(lib.photos.length, 45);
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

test('a grid that is briefly blank is not taken as proof', async () => {
  const lib = fakeLibrary({ total: 20, failTrash: true, blankPollsAfterTrash: 150 });
  await assert.rejects(runnerFor(lib, { batchSize: 10 }).run(10), { code: 'not-removed' });
});

test('backs out of the dialog when it cannot find the confirm button', async () => {
  const lib = fakeLibrary({ total: 20, confirmFound: false });
  await assert.rejects(runnerFor(lib).run(5), { code: 'no-confirm-button' });
  assert.equal(lib.stats.confirmClicks, 0);
  assert.equal(lib.stats.cancels, 1, 'it cancels the dialog');
  assert.equal(lib.photos.length, 20);
  assert.equal(lib.isDialogOpen(), false, 'the dialog is closed');
  assert.equal(lib.selected.size, 0, 'the selection is cleared');
});

test('waits for a selection bar that appears late instead of asking for help', async () => {
  const lib = fakeLibrary({ total: 20, barLatePolls: 40 });
  const asked = [];
  const res = await runnerFor(lib, { batchSize: 10, teach: async (kind) => { asked.push(kind); return ''; } }).run(10);
  assert.equal(res.trashed, 10);
  assert.deepEqual(asked, [], 'no teaching click was needed');
});

test('pauses while the tab is hidden, then carries on', async () => {
  const lib = fakeLibrary({ total: 10, hiddenPolls: 30 });
  const phases = [];
  const res = await runnerFor(lib, { batchSize: 10, onProgress: (s) => phases.push(s.phase) }).run(Infinity);
  assert.equal(res.trashed, 10);
  assert.ok(phases.includes('paused'));
});

test('stop before the trash click clears the selection and moves nothing', async () => {
  const lib = fakeLibrary({ total: 50 });
  let runner = null;
  runner = runnerFor(lib, { batchSize: 5, onProgress: (s) => { if (s.phase === 'checking') runner.stop(); } });
  await assert.rejects(runner.run(Infinity), (err) => err.code === 'stopped' && err.trashed === 0);
  assert.equal(lib.stats.trashClicks, 0);
  assert.equal(lib.selected.size, 0);
  assert.equal(lib.photos.length, 50);
});

test('stop while Google is moving a batch still counts that batch', async () => {
  const lib = fakeLibrary({ total: 50 });
  let runner = null;
  runner = runnerFor(lib, { batchSize: 5, onProgress: (s) => { if (s.phase === 'waiting') runner.stop(); } });
  const res = await runner.run(Infinity);
  assert.equal(res.reason, 'stopped');
  assert.equal(res.trashed, 5);
  assert.equal(lib.photos.length, 45);
});

test('stop between batches ends the run', async () => {
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
  const teach = async (kind, ctx) => {
    asked.push(kind);
    assert.ok(ctx && ctx.place, 'the teaching step knows the confirmed place');
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

test('stop during a teaching step cancels the dialog and clears the selection', async () => {
  const lib = fakeLibrary({ total: 12, confirmFound: false });
  const teach = async () => { throw new FPR.RunError('stopped'); };
  await assert.rejects(runnerFor(lib, { batchSize: 5, teach }).run(Infinity), { code: 'stopped' });
  assert.equal(lib.stats.confirmClicks, 0);
  assert.equal(lib.isDialogOpen(), false);
  assert.equal(lib.selected.size, 0);
  assert.equal(lib.photos.length, 12);
});

test('a dialog about emptying the trash or deleting for good is cancelled, never confirmed', async () => {
  const lib = fakeLibrary({ total: 20, unsafeDialog: true });
  await assert.rejects(runnerFor(lib).run(5), { code: 'unsafe-dialog' });
  assert.equal(lib.stats.confirmClicks, 0);
  assert.equal(lib.stats.cancels, 1);
  assert.equal(lib.isDialogOpen(), false);
  assert.equal(lib.selected.size, 0);
  assert.equal(lib.photos.length, 20);
});

test('after a trash button learned from a click, the user confirms that batch too', async () => {
  const lib = fakeLibrary({ total: 12, trashFound: false, confirmFound: true });
  const asked = [];
  const teach = async (kind) => {
    asked.push(kind);
    lib.adapter.click(kind === 'trash' ? TRASH : CONFIRM);
    return 'Move to trash';
  };
  const res = await runnerFor(lib, { batchSize: 5, teach }).run(Infinity);
  assert.equal(res.trashed, 12);
  assert.deepEqual(asked, ['trash', 'confirm'], 'the first batch asks for both, the rest asks for nothing');
});

test('a dialog that closes while the photos stay selected stops the run', async () => {
  const lib = fakeLibrary({ total: 20, confirmNoEffect: true });
  await assert.rejects(runnerFor(lib).run(5), { code: 'no-effect' });
  assert.equal(lib.photos.length, 20);
  assert.equal(lib.selected.size, 0, 'the selection is cleared');
});

test('a tab hidden while it waits for the selection bar pauses instead of giving up', async () => {
  const lib = fakeLibrary({ total: 20, hideAfterClicks: 10, hideFor: 2000 });
  const phases = [];
  const res = await runnerFor(lib, { batchSize: 10, onProgress: (s) => phases.push(s.phase) }).run(10);
  assert.equal(res.trashed, 10);
  assert.ok(phases.includes('paused'));
});

test('when the selection bar never shows, it presses Escape to drop the selection', async () => {
  const lib = fakeLibrary({ total: 20, barNeverDrawn: true });
  await assert.rejects(runnerFor(lib, { batchSize: 10 }).run(10), { code: 'no-count' });
  assert.ok(lib.stats.escapes >= 1);
  assert.equal(lib.selected.size, 0);
  assert.equal(lib.stats.trashClicks, 0);
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

test('only the Library and the Archive count as supported pages', () => {
  const adapterFor = (p) => FPR.createDomAdapter({}, {}, FPR.createStore(null), { path: p });
  const supported = { '/': 'library', '/u/1/': 'library', '/u/2': 'library', '/archive': 'archive', '/u/1/archive/': 'archive' };
  Object.keys(supported).forEach((p) => {
    assert.deepEqual(adapterFor(p).page(), { ok: true, kind: supported[p] }, p);
  });
  ['/photo/AF1Qip', '/albums', '/search/cats', '/trash', '/u/1/trash', '/lockedfolder'].forEach((p) => {
    assert.equal(adapterFor(p).page().ok, false, p);
  });
});

test('the page adapter clicks nothing at all off the Library and the Archive', () => {
  let clicked = 0;
  const button = {
    isConnected: true,
    getAttribute: (name) => (name === 'aria-label' ? 'Naar prullenbak' : null),
    click: () => { clicked++; }
  };
  const onTrashPage = FPR.createDomAdapter({}, {}, FPR.createStore(null), { path: '/trash' });
  assert.equal(onTrashPage.click(button), false);
  const onLibrary = FPR.createDomAdapter({}, {}, FPR.createStore(null), { path: '/' });
  assert.equal(onLibrary.click(button), true);
  const emptyButton = Object.assign({}, button, { getAttribute: (name) => (name === 'aria-label' ? 'Prullenbak leegmaken' : null) });
  assert.equal(onLibrary.click(emptyButton), false, 'never a button that empties the trash');
  assert.equal(clicked, 1);
});
