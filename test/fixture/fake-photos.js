/*
 * A stand-in for the Google Photos library page, used by test/e2e.test.js.
 *
 * It copies the structure of the real page as seen on 25 September 2026:
 * each photo checkbox sits next to exactly one link to the photo, day headers
 * carry their own select-all checkbox, only rows near the visible part are in
 * the DOM, a selection bar with the count and a trash button replaces the top
 * bar, and a dialog asks before anything moves to the trash. In Dutch that
 * dialog asks "Verwijderen uit je Google-account...?" with the buttons
 * "Annuleren" (action code IbE0S) and "Weggooien" (EBS5u). The English
 * labels below are assumptions; only the Dutch ones were seen.
 *
 * It runs a list of scenarios against the real runner and DOM adapter and
 * writes the results into <pre id="result">.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return; // loaded by a Node test runner by mistake

  const LABELS = {
    en: {
      clear: 'Clear selection', count: (n) => n + ' selected', share: 'Share', album: 'Add to album',
      trash: 'Move to trash', cancel: 'Cancel', confirm: 'Move to trash', title: 'Move to trash?',
      search: 'Search your photos', settings: 'Settings', empty: 'Empty trash'
    },
    nl: {
      clear: 'Selectie wissen', count: (n) => n + ' geselecteerd', share: 'Delen',
      album: 'Maken of toevoegen aan album', trash: 'Naar prullenbak', cancel: 'Annuleren',
      confirm: 'Weggooien',
      title: "Verwijderen uit je Google-account, apparaten waarop back-up aanstaat en plekken waar je ze hebt gedeeld binnen Google Foto's?",
      search: "Je foto's doorzoeken", settings: 'Instellingen', empty: 'Prullenbak leegmaken'
    }
  };
  const COLS = 6;
  const TILE = 110;
  const DAY = 40;
  const PER_DAY = 9;

  const topbar = document.getElementById('topbar');
  const topright = document.getElementById('topright');
  const main = document.getElementById('main');
  const grid = document.getElementById('grid');
  let fx = null;
  let renderedAt = -1;

  document.getElementById('decoy').addEventListener('click', () => { fx.decoyClicks++; });

  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (text) e.textContent = text;
    return e;
  }

  function reset(options) {
    document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
    fx = Object.assign({
      total: 40, lang: 'en', askFirst: true, failTrash: false, extraOnFirstClick: 0, promo: false,
      trashDelay: 150, barDelay: 0, plainDialog: false, rtl: false, accountName: 'Test User',
      emptyTrashButton: false, evilDialog: false, twoDialogs: false, noCount: false,
      navigateAfterBatches: 0, path: '/', badge: false, promoBeforeConfirm: false, permanentDialog: false,
      acceptOnly: false
    }, options);
    fx.photos = [];
    for (let i = 0; i < fx.total; i++) {
      fx.photos.push({ id: 'AF1Qip' + String(i).padStart(5, '0'), day: Math.floor(i / PER_DAY) });
    }
    fx.selected = new Set();
    fx.dialog = null;
    fx.barHidden = false;
    fx.barShown = false;
    fx.batchesDone = 0;
    Object.assign(fx, {
      groupClicks: 0, decoyClicks: 0, trashClicks: 0, confirmClicks: 0, emptyClicks: 0, clearClicks: 0,
      promoClicks: 0, notifClicks: 0, clicksByPhoto: {}
    });
    if (fx.promo) document.body.appendChild(el('div', { role: 'dialog', 'aria-modal': 'true', class: 'dlg' }, 'Your storage is full'));
    // badge: a number with a word next to a header button, in both modes.
    topright.replaceChildren();
    if (fx.badge) {
      const notifications = el('button', { 'aria-label': 'Notifications' });
      notifications.addEventListener('click', () => { fx.notifClicks++; });
      topright.append(notifications, el('span', {}, '3 new'));
    }
    topbar.dir = fx.rtl ? 'rtl' : 'ltr';
    main.scrollTop = 0;
    renderTop();
    renderGrid(true);
  }

  function layout() {
    const items = [];
    let y = 0;
    let day = -1;
    let col = 0;
    fx.photos.forEach((p) => {
      if (p.day !== day) {
        if (col) { y += TILE; col = 0; }
        day = p.day;
        items.push({ kind: 'day', day, y });
        y += DAY;
      }
      items.push({ kind: 'photo', photo: p, x: col * TILE, y });
      col++;
      if (col === COLS) { col = 0; y += TILE; }
    });
    if (col) y += TILE;
    return { items, height: y };
  }

  // Like the real grid, only rows near the visible part are in the DOM.
  function renderGrid(force) {
    if (!force && main.scrollTop === renderedAt) return;
    renderedAt = main.scrollTop;
    const { items, height } = layout();
    grid.style.height = Math.max(height, 1) + 'px';
    const top = main.scrollTop - 100;
    const bottom = main.scrollTop + main.clientHeight + 100;
    grid.replaceChildren();
    items.forEach((item) => {
      const size = item.kind === 'day' ? DAY : TILE;
      if (item.y + size < top || item.y > bottom) return;
      if (item.kind === 'day') {
        const row = el('div', { class: 'day' });
        row.style.top = item.y + 'px';
        const box = el('div', {
          role: 'checkbox', 'aria-checked': 'false', tabindex: '0',
          'aria-label': 'Select all photos from day ' + item.day
        });
        box.addEventListener('click', () => {
          fx.groupClicks++;
          fx.photos.filter((p) => p.day === item.day).forEach((p) => fx.selected.add(p.id));
          renderTop();
        });
        row.append(box, el('span', {}, 'Day ' + item.day));
        grid.appendChild(row);
        return;
      }
      const p = item.photo;
      const label = 'Photo - Landscape - ' + p.id;
      const tile = el('div', { class: 'tile' });
      tile.style.left = item.x + 'px';
      tile.style.top = item.y + 'px';
      const box = el('div', {
        role: 'checkbox', 'aria-checked': fx.selected.has(p.id) ? 'true' : 'false', 'aria-label': label,
        tabindex: '0'
      });
      box.addEventListener('click', () => {
        fx.clicksByPhoto[p.id] = (fx.clicksByPhoto[p.id] || 0) + 1;
        if (fx.selected.has(p.id)) fx.selected.delete(p.id);
        else fx.selected.add(p.id);
        if (fx.extraOnFirstClick && fx.selected.size === 1) {
          fx.photos.slice(-fx.extraOnFirstClick).forEach((q) => fx.selected.add(q.id));
        }
        renderTop();
        // The real page updates aria-checked a moment later.
        setTimeout(() => box.setAttribute('aria-checked', fx.selected.has(p.id) ? 'true' : 'false'), 50);
      });
      const link = el('a', { href: './photo/' + p.id, 'aria-label': label });
      link.addEventListener('click', (e) => e.preventDefault());
      tile.append(box, link);
      grid.appendChild(tile);
    });
  }

  function button(label, onClick) {
    const b = el('button', { 'aria-label': label });
    b.addEventListener('click', onClick);
    return b;
  }

  function renderTop() {
    const L = LABELS[fx.lang];
    topbar.replaceChildren();
    if (fx.selected.size) {
      // With barDelay, the selection bar waits above the page before it slides
      // in, like the real one in a tab that Chrome draws slowly.
      if (fx.barDelay && !fx.barShown && !fx.barHidden) {
        fx.barHidden = true;
        setTimeout(() => { fx.barHidden = false; fx.barShown = true; renderTop(); }, fx.barDelay);
      }
      topbar.style.transform = fx.barHidden ? 'translateY(-200px)' : '';
      const spacer = el('div');
      spacer.style.flex = '1';
      const parts = [
        button(L.clear, () => { fx.clearClicks++; fx.selected.clear(); renderTop(); }),
        fx.noCount ? null : el('div', {}, L.count(fx.selected.size)),
        spacer,
        button(L.share, () => {}),
        button(L.album, () => {}),
        fx.emptyTrashButton ? button(L.empty, () => { fx.emptyClicks++; }) : null,
        button(L.trash, onTrash)
      ];
      parts.forEach((p) => { if (p) topbar.appendChild(p); });
    } else {
      topbar.style.transform = '';
      fx.barShown = false;
      topbar.append(
        el('input', { placeholder: L.search }),
        button(L.settings, () => {}),
        button('Google Account: ' + fx.accountName + ' (someone@example.com)', () => {})
      );
    }
  }

  function onTrash() {
    fx.trashClicks++;
    if (!fx.askFirst) { moveSelectedToTrash(); return; }
    // promoBeforeConfirm: a pop-up with Google's own dialog codes opens first,
    // and the real confirm dialog 300 ms later.
    // acceptOnly: a dialog with Google's accept code but no cancel code.
    if (fx.acceptOnly) {
      const odd = el('div', { role: 'dialog', 'aria-modal': 'true', class: 'dlg' });
      const ok = el('button', { 'data-mdc-dialog-action': 'EBS5u' }, 'OK');
      ok.addEventListener('click', () => { fx.promoClicks++; odd.remove(); });
      odd.append(el('h2', {}, 'Something happened'), ok);
      document.body.appendChild(odd);
      fx.dialog = odd;
      return;
    }
    if (fx.promoBeforeConfirm) {
      const promo = el('div', { role: 'dialog', 'aria-modal': 'true', class: 'dlg' });
      const no = el('button', { 'data-mdc-dialog-action': 'IbE0S' }, 'No thanks');
      const yes = el('button', { 'data-mdc-dialog-action': 'EBS5u' }, 'Get more storage');
      no.addEventListener('click', () => promo.remove());
      yes.addEventListener('click', () => { fx.promoClicks++; promo.remove(); });
      promo.append(el('h2', {}, 'Running out of space?'), no, yes);
      document.body.appendChild(promo);
      setTimeout(openConfirm, 300);
      return;
    }
    openConfirm();
  }

  function openConfirm() {
    const L = LABELS[fx.lang];
    const d = el('div', { role: 'dialog', 'aria-modal': 'true', class: 'dlg' });
    const codes = !fx.plainDialog;
    const cancel = el('button', codes ? { 'data-mdc-dialog-action': 'IbE0S' } : {}, L.cancel);
    cancel.addEventListener('click', closeDialog);
    // evilDialog: its accept button would empty the trash.
    // permanentDialog: it deletes for good, with a plain "Delete" button.
    const okLabel = fx.evilDialog ? L.empty : (fx.permanentDialog ? 'Delete' : L.confirm);
    const title = fx.permanentDialog ? 'Delete forever? These photos will be deleted permanently.' : L.title;
    const ok = el('button', codes ? { 'data-mdc-dialog-action': 'EBS5u', 'data-mdc-dialog-initial-focus': '' } : {}, okLabel);
    ok.addEventListener('click', () => {
      if (fx.evilDialog || fx.permanentDialog) { fx.emptyClicks++; closeDialog(); return; }
      fx.confirmClicks++;
      closeDialog();
      moveSelectedToTrash();
    });
    d.append(el('h2', {}, title), cancel, ok);
    document.body.appendChild(d);
    fx.dialog = d;
    if (fx.twoDialogs) {
      document.body.appendChild(el('div', { role: 'dialog', 'aria-modal': 'true', class: 'dlg' }, 'Something else'));
    }
  }

  function closeDialog() {
    if (fx.dialog) {
      fx.dialog.remove();
      fx.dialog = null;
    }
  }

  function moveSelectedToTrash() {
    setTimeout(() => {
      if (!fx.failTrash) fx.photos = fx.photos.filter((p) => !fx.selected.has(p.id));
      fx.selected.clear();
      fx.batchesDone++;
      // navigateAfterBatches: the user opens the Archive while the run goes on.
      if (fx.navigateAfterBatches && fx.batchesDone >= fx.navigateAfterBatches) fx.path = '/archive';
      renderTop();
      renderGrid(true);
    }, fx.trashDelay);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (fx.dialog) closeDialog();
    else if (fx.selected.size) { fx.selected.clear(); renderTop(); }
  });
  main.addEventListener('scroll', () => renderGrid(false));
  setInterval(() => renderGrid(false), 30);

  const FPR = window.BulkDeleteForGooglePhotos;
  const FAST = {
    clickDelay: 1, settleDelay: 80, poll: 20, stepTimeout: 4000, barTimeout: 3000, trashTimeout: 6000,
    emptyQuiet: 1000, pauseBetweenBatches: 20
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function scenario(name, fixtureOptions, runOptions, expected) {
    reset(fixtureOptions);
    await wait(100);
    const adapter = FPR.createDomAdapter(document, window, FPR.createStore(null), { path: () => fx.path });
    // defaults: run with the real timings instead of the fast ones.
    const timings = runOptions.defaults ? {} : FAST;
    const runner = FPR.createRunner(adapter, Object.assign({ batchSize: runOptions.batchSize || 10 }, timings));
    const before = fx.photos.length;
    let res = null;
    let error = null;
    try {
      res = await runner.run(runOptions.limit === undefined ? Infinity : runOptions.limit);
    } catch (e) {
      error = e;
    }
    await wait(300);
    const out = {
      name,
      trashed: res ? res.trashed : (error && error.trashed) || 0,
      reason: res ? res.reason : null,
      error: error ? (error.code || String(error)) : null,
      removed: before - fx.photos.length,
      remaining: fx.photos.length,
      selectedLeft: fx.selected.size,
      dialogOpen: !!fx.dialog,
      groupClicks: fx.groupClicks,
      decoyClicks: fx.decoyClicks,
      trashClicks: fx.trashClicks,
      confirmClicks: fx.confirmClicks,
      emptyClicks: fx.emptyClicks,
      clearClicks: fx.clearClicks,
      promoClicks: fx.promoClicks,
      notifClicks: fx.notifClicks,
      doubleClicks: Object.values(fx.clicksByPhoto).filter((n) => n > 1).length
    };
    const problems = [];
    Object.keys(expected).forEach((key) => {
      if (out[key] !== expected[key]) problems.push(key + ': expected ' + expected[key] + ', got ' + out[key]);
    });
    if (out.groupClicks) problems.push('clicked a day checkbox');
    if (out.decoyClicks) problems.push('clicked a button outside the top bar');
    if (out.emptyClicks) problems.push('clicked a button that empties the trash or deletes for good');
    if (out.promoClicks) problems.push('clicked a button in a pop-up');
    if (out.notifClicks) problems.push('clicked a header button outside the selection bar');
    if (out.doubleClicks) problems.push('clicked a photo twice');
    if (error && !expected.error) problems.push('error: ' + (error.stack || error));
    out.problems = problems;
    out.ok = problems.length === 0;
    return out;
  }

  async function runAll() {
    const results = [];
    const add = async (...args) => results.push(await scenario(...args));
    await add('English, 25 of 60 in batches of 10', { total: 60 }, { limit: 25, batchSize: 10 },
      { trashed: 25, removed: 25, reason: 'limit', error: null, selectedLeft: 0, dialogOpen: false });
    await add('English, all 120 in batches of 50 (scrolls inside a batch)', { total: 120 }, { batchSize: 50 },
      { trashed: 120, removed: 120, remaining: 0, reason: 'empty', error: null });
    await add('Dutch, everything, with the real Weggooien dialog', { total: 30, lang: 'nl' }, { batchSize: 12 },
      { trashed: 30, removed: 30, remaining: 0, reason: 'empty', error: null });
    await add('The selection bar appears 1.5 s late', { total: 20, lang: 'nl', barDelay: 1500 }, { limit: 10 },
      { trashed: 10, removed: 10, reason: 'limit', error: null });
    await add('Right to left: moves the photos', { total: 30, rtl: true }, { limit: 10 },
      { trashed: 10, removed: 10, reason: 'limit', error: null });
    await add('Right to left: too many selected, clears with the right button', { total: 30, rtl: true, extraOnFirstClick: 5 },
      { limit: 10 }, { error: 'too-many', removed: 0, trashClicks: 0, selectedLeft: 0, clearClicks: 1 });
    await add('An account name with a trash word in it', { total: 20, accountName: 'Ahmad bin Ismail' }, { limit: 10 },
      { trashed: 10, removed: 10, reason: 'limit', error: null });
    await add('An Empty trash button in the bar is never touched', { total: 20, emptyTrashButton: true }, { limit: 10 },
      { trashed: 10, removed: 10, reason: 'limit', error: null, emptyClicks: 0 });
    await add('A dialog whose accept button empties the trash is cancelled', { total: 20, evilDialog: true },
      { limit: 5 }, { error: 'unsafe-dialog', removed: 0, emptyClicks: 0, dialogOpen: false, selectedLeft: 0 });
    await add('A dialog that deletes forever, with a plain Delete button, is cancelled', { total: 20, permanentDialog: true },
      { limit: 5 }, { error: 'unsafe-dialog', removed: 0, emptyClicks: 0, dialogOpen: false, selectedLeft: 0 });
    await add('A pop-up that opens just before the confirm dialog: nothing is confirmed', { total: 20, promoBeforeConfirm: true },
      { limit: 5 }, { error: 'unexpected-dialog', removed: 0, confirmClicks: 0, promoClicks: 0 });
    await add('A dialog with an accept code but no cancel code is not confirmed', { total: 20, acceptOnly: true },
      { limit: 5 }, { error: 'no-confirm-button', removed: 0, promoClicks: 0, selectedLeft: 0 });
    await add('A number badge in the top bar is not a selection', { total: 20, badge: true }, { limit: 10 },
      { trashed: 10, removed: 10, reason: 'limit', error: null, notifClicks: 0 });
    await add('The real default timings', { total: 30 }, { limit: 12, batchSize: 5, defaults: true },
      { trashed: 12, removed: 12, reason: 'limit', error: null });
    await add('Two dialogs at once: nothing is confirmed', { total: 20, twoDialogs: true }, { limit: 5 },
      { error: 'unexpected-dialog', removed: 0, confirmClicks: 0 });
    await add('No count in the selection bar: stops before the trash', { total: 20, noCount: true }, { limit: 5 },
      { error: 'no-count', removed: 0, trashClicks: 0, selectedLeft: 0 });
    await add('The user opens the Archive during the run', { total: 60, navigateAfterBatches: 1 }, { batchSize: 10 },
      { error: 'page-changed', removed: 10, trashed: 10, trashClicks: 1 });
    await add('A confirm button it cannot recognise: backs out', { total: 20, lang: 'nl', plainDialog: true },
      { limit: 5 }, { error: 'no-confirm-button', removed: 0, confirmClicks: 0, dialogOpen: false, selectedLeft: 0 });
    await add('English dialog without action codes: matches the trash label', { total: 20, plainDialog: true },
      { limit: 5 }, { trashed: 5, removed: 5, reason: 'limit', error: null });
    await add('Google fails to remove the batch', { total: 20, failTrash: true }, { batchSize: 10 },
      { error: 'not-removed', removed: 0, trashed: 0 });
    await add('Google selects more than planned', { total: 40, extraOnFirstClick: 5 }, { limit: 10 },
      { error: 'too-many', removed: 0, trashClicks: 0, selectedLeft: 0 });
    await add('A single photo page is not supported', { total: 10, path: '/photo/AF1Qip00001' }, {},
      { error: 'unsupported-page', trashClicks: 0, removed: 0 });
    await add('A Google pop-up is open', { total: 10, promo: true }, {},
      { error: 'close-popup', trashClicks: 0, removed: 0 });
    await add('Google moves photos without asking', { total: 15, askFirst: false }, { batchSize: 50 },
      { trashed: 15, removed: 15, reason: 'empty', confirmClicks: 0, error: null });
    return results;
  }

  runAll().then((results) => {
    document.getElementById('result').textContent = JSON.stringify(results);
  }, (e) => {
    document.getElementById('result').textContent = JSON.stringify([
      { name: 'fixture crashed', ok: false, problems: [String((e && e.stack) || e)] }
    ]);
  });
})();
