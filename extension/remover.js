/*
 * Bulk Delete for Google Photos
 *
 * Moves photos from your Google Photos Library or Archive to the trash in
 * bulk, free and without a daily limit. It clicks the same checkboxes and
 * buttons you would click yourself. It never empties the trash and sends
 * nothing anywhere.
 *
 * Use it as a browser extension (see README.md), or paste this whole file into
 * the browser console on photos.google.com.
 *
 * MIT licence. https://github.com/JasonKrijgsman/bulk-delete-for-google-photos
 * Not affiliated with or endorsed by Google.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const NAME = 'Bulk Delete for Google Photos';
  const PANEL_ID = 'bulk-delete-for-google-photos';
  const STORE_PREFIX = 'bulkDeleteForGooglePhotos.';
  const REPO_URL = 'https://github.com/JasonKrijgsman/bulk-delete-for-google-photos';

  // Google Photos keeps its top bar, and the selection bar that replaces it,
  // in the top 64 CSS pixels. Buttons lower on the page are never clicked.
  const TOP_BAR_HEIGHT = 72;

  // Google marks the buttons of its dialogs with action codes. In the trash
  // dialog, seen on the Dutch interface on 25 Sep 2026, "Weggooien" (confirm)
  // carries EBS5u and "Annuleren" (cancel) IbE0S. They look like code, not
  // translated text, but only the Dutch interface was seen.
  const ACCEPT_ACTION = 'EBS5u';
  const CANCEL_ACTION = 'IbE0S';

  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

  // The word for "trash" in the label of the trash button, per language.
  // A label learned from the user's own click always wins over this list.
  const TRASH_WORDS = new RegExp([
    '\\btrash\\b', '\\bbin\\b', 'prullenbak', 'papierkorb', 'corbeille', 'papelera', 'paperera',
    'cestino', 'lixeira', 'lixo', 'kosz', 'koš', 'papperskorg', 'papirkurv', 'roskakori',
    'prügikast', 'šiukšliadėž', 'atkritn', 'kuk[aá]', 'co[șş]', 'otpad', 'smetnjak', 'çöp',
    'sampah', 'basurahan', 'thùng rác', 'корзин', 'кошик', 'кошче', 'отпад', 'κάδο', 'אשפה',
    'المهملات', 'ट्रैश', 'ถังขยะ', 'ゴミ箱', '휴지통', '回收站', '垃圾桶'
  ].join('|'), 'iu');

  // Verbs for emptying something. Alone they are harmless: "Clear selection"
  // reads "Tyhjennä valinta" in Finnish. Next to a trash word they empty it.
  const EMPTY_WORDS = new RegExp([
    '\\bempty\\b', 'leegmaken', 'leeren', 'vider', 'vaciar', 'buid', 'svuota', 'esvaziar',
    'opróżnij', 'töm', 'tøm', 'tyhjennä', 'tühjenda', 'iztukš', 'ištušt', 'vyprázdn', 'ürít',
    'golește', 'isprazni', 'izprazni', 'испразн', 'изпразн', 'boşalt', 'kosongkan', 'dọn sạch',
    'очист', 'спорожн', 'άδειασ', 'רוקן', 'إفراغ', 'खाली', 'ล้าง', 'を空', '비우기', '清空'
  ].join('|'), 'iu');

  // Words for deleting for good.
  const PERMANENT_WORDS = new RegExp([
    'permanen', 'forever', 'definitief', 'endgültig', 'définitiv', 'definitiv', 'trwale', 'trvale',
    'véglegesen', 'trajno', 'kalıcı', 'pysyvästi', 'lõplikult', 'neatgriezenisk', 'visam laikui',
    'vĩnh viễn', 'навсегда', 'назавжди', 'οριστικ', 'לצמיתות', 'نهائي', '完全に削除', '영구', '永久'
  ].join('|'), 'iu');

  // A button or a dialog that empties the trash or deletes for good. The tool
  // never clicks one, never confirms one and never learns one. This is a
  // second line: it only clicks at all on the Library and the Archive.
  function forbidden(text) {
    const t = String(text || '');
    return PERMANENT_WORDS.test(t) || (EMPTY_WORDS.test(t) && TRASH_WORDS.test(t));
  }

  const MESSAGES = {
    'unsupported-page': 'Open your Photos library or your Archive first.',
    'no-account': 'Could not see which Google account is signed in. Reload the page, then start again.',
    'close-popup': 'Close the Google Photos pop-up first, then start again.',
    'page-changed': 'The page or the account changed, so it stopped.',
    'bad-limit': 'Enter a whole number, or leave the box empty for all.',
    'clear-failed': 'Could not clear the current selection. Clear it yourself, then start again.',
    'no-count': 'Could not read how many photos Google selected, so nothing from that batch was moved. Stopped to be safe. Check that no photos are still selected.',
    'too-many': 'Google selected more photos than planned, so nothing from that batch was moved. Stopped to be safe.',
    'no-trash-button': 'Could not find the trash button. Check that no photos are still selected.',
    'no-dialog': 'Google did not react to the trash button.',
    'unexpected-dialog': 'More than one Google dialog opened, so nothing was confirmed. Check the page.',
    'unsafe-dialog': 'The Google dialog speaks of emptying the trash or deleting for good, so nothing was confirmed.',
    'no-confirm-button': 'Could not find the confirm button in the Google dialog. Nothing from that batch was moved.',
    'no-effect': 'The Google dialog closed, but the photos stayed selected. Nothing from that batch was moved.',
    'trash-timeout': 'Google took too long to move the photos. Check the page, then start again.',
    'not-removed': 'Google did not remove all photos from the last batch. Try again later.',
    'busy': 'It is already running.',
    'stopped': 'Stopped.'
  };

  class RunError extends Error {
    constructor(code, detail) {
      super(MESSAGES[code] || code);
      this.name = 'RunError';
      this.code = code;
      this.detail = detail || null;
      this.trashed = 0;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Reads the first number in a label such as "1.234 geselecteerd" or
  // "2,500 selected". Returns null when the text holds no number.
  function parseCount(text) {
    const match = /(\d{1,3}(?:[.,   ]\d{3})+|\d+)/.exec(String(text || ''));
    return match ? parseInt(match[1].replace(/\D/g, ''), 10) : null;
  }

  // Empty means "all". A positive whole number is a limit. Anything else is
  // invalid and returns null, so a typo can never turn into "all".
  function parseLimit(value) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    if (text === '') return Infinity;
    if (!/^\d+$/.test(text)) return null;
    const n = parseInt(text, 10);
    return n > 0 ? n : null;
  }

  // localStorage with a memory fallback. It holds the collapsed state of the
  // panel and any button label learned from the user.
  function createStore(win) {
    const memory = {};
    function storage() {
      try { return win && win.localStorage ? win.localStorage : null; } catch (e) { return null; }
    }
    return {
      get(key) {
        const s = storage();
        try {
          const value = s ? s.getItem(STORE_PREFIX + key) : null;
          if (value !== null) return value;
        } catch (e) { /* storage blocked: use memory */ }
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      },
      set(key, value) {
        memory[key] = String(value);
        const s = storage();
        try { if (s) s.setItem(STORE_PREFIX + key, String(value)); } catch (e) { /* memory only */ }
      },
      remove(key) {
        delete memory[key];
        const s = storage();
        try { if (s) s.removeItem(STORE_PREFIX + key); } catch (e) { /* memory only */ }
      }
    };
  }

  // The runner holds the whole procedure. It talks to the page only through
  // the adapter, so the tests can drive it with a fake library.
  function createRunner(adapter, options) {
    const o = Object.assign({
      batchSize: 250,
      clickDelay: 15,
      settleDelay: 700,
      poll: 100,
      stepTimeout: 15000,
      barTimeout: 8000,
      dialogSettle: 500,
      trashTimeout: 120000,
      effectTimeout: 15000,
      emptyQuiet: 5000,
      pauseBetweenBatches: 1000,
      maxIdleScrolls: 3,
      sleep: sleep,
      log: function () {},
      onProgress: function () {},
      teach: null
    }, options || {});

    let stopRequested = false;
    let running = false;
    let pin = null;
    const state = { trashed: 0, batches: 0, phase: 'idle' };

    function progress(phase) {
      state.phase = phase;
      o.onProgress(Object.assign({}, state));
    }

    // Chrome barely draws a hidden tab, so the page stops changing. Wait for
    // it to come back instead of timing out.
    async function pauseWhileHidden(ignoreStop) {
      const phase = state.phase;
      o.log('Paused: this tab is hidden. Keep it in front to continue.');
      progress('paused');
      while (adapter.isHidden()) {
        if (stopRequested && !ignoreStop) throw new RunError('stopped');
        await o.sleep(o.poll * 5);
      }
      o.log('Continuing.');
      progress(phase);
    }

    // Polls check() until it returns something truthy, for at most timeout
    // ms of visible time. With stableFor, the value must hold that long
    // without a break. Stop interrupts the wait unless ignoreStop is set.
    async function waitFor(check, timeout, stableFor, ignoreStop) {
      const tries = Math.max(1, Math.ceil(timeout / o.poll));
      const needed = Math.max(1, Math.ceil((stableFor || 0) / o.poll));
      let streak = 0;
      let i = 0;
      while (i < tries) {
        if (stopRequested && !ignoreStop) throw new RunError('stopped');
        if (adapter.isHidden()) {
          await pauseWhileHidden(ignoreStop);
          streak = 0;
          continue;
        }
        const value = check();
        if (value) {
          streak++;
          if (streak >= needed) return value;
        } else {
          streak = 0;
        }
        i++;
        await o.sleep(o.poll);
      }
      return null;
    }

    // Every click happens on the page and account the user confirmed.
    function checkPlace() {
      if (!adapter.samePlace(pin)) throw new RunError('page-changed');
    }

    // With force, it also presses Escape when no selection bar is drawn,
    // because photos can be selected while the bar has not slid in yet.
    async function clearSelection(force) {
      if (!adapter.inSelectionMode()) {
        if (force) adapter.pressEscape();
        return;
      }
      adapter.clearSelection(false);
      if (await waitFor(function () { return !adapter.inSelectionMode(); }, 3000, 0, true)) return;
      adapter.clearSelection(true);
      if (await waitFor(function () { return !adapter.inSelectionMode(); }, 3000, 0, true)) return;
      throw new RunError('clear-failed');
    }

    // Ticks up to `want` photo checkboxes, from the top of the grid down.
    // It never ticks a day header's select-all box: the adapter only returns
    // checkboxes that sit next to exactly one photo link.
    async function selectBatch(want) {
      progress('selecting');
      if (adapter.isHidden()) await pauseWhileHidden(false);
      adapter.scrollToTop();
      await o.sleep(o.settleDelay);
      const ids = [];
      const seen = new Set();
      let idle = 0;
      let staleRounds = 0;
      let reachedEnd = false;
      while (ids.length < want && !stopRequested) {
        checkPlace();
        let added = 0;
        let stale = false;
        for (const tile of adapter.tiles()) {
          if (ids.length >= want || stopRequested) break;
          if (seen.has(tile.id)) continue;
          if (tile.checked) { seen.add(tile.id); continue; }
          // The grid can replace a tile while we work. Read it again then.
          if (!adapter.click(tile.checkbox)) { stale = true; break; }
          seen.add(tile.id);
          ids.push(tile.id);
          added++;
          await o.sleep(o.clickDelay);
        }
        if (ids.length >= want || stopRequested) break;
        if (stale && staleRounds < 20) {
          staleRounds++;
          await o.sleep(o.clickDelay);
          continue;
        }
        staleRounds = 0;
        const moved = adapter.scrollDown();
        await o.sleep(o.settleDelay);
        if (added === 0 && !moved) {
          idle++;
          if (idle >= o.maxIdleScrolls) { reachedEnd = true; break; }
        } else {
          idle = 0;
        }
      }
      return { ids: ids, reachedEnd: reachedEnd };
    }

    async function trashBatch(batch, want) {
      const ids = batch.ids;
      progress('checking');
      let counted = null;
      try {
        await o.sleep(o.settleDelay);
        // The selection bar slides in. Give it a few seconds to arrive.
        await waitFor(function () { return adapter.findTrashButton(); }, o.barTimeout);
        counted = await waitFor(function () { return adapter.selectionCount(); }, o.barTimeout);
        checkPlace();
      } catch (err) {
        if (err && err.code === 'stopped') await clearSelection(true);
        throw err;
      }

      // Safety checks: Google's own count must be readable, and it may not
      // exceed what was planned or what this batch ticked.
      o.log('Ticked ' + ids.length + ' photos. Google shows ' +
        (counted ? counted + ' selected' : 'no count') + '.');
      if (!counted) {
        await clearSelection(true);
        throw new RunError('no-count');
      }
      if (counted > want || counted > ids.length) {
        await clearSelection(true);
        throw new RunError('too-many', { counted: counted, want: want, ticked: ids.length });
      }

      // Each batch starts at the top of the grid, so its first photos are the
      // ones shown at the top afterwards if Google did not remove them.
      const probe = new Set(ids.slice(0, 12));

      progress('trashing');
      if (stopRequested) {
        await clearSelection(true);
        throw new RunError('stopped');
      }
      const before = adapter.dialogs();
      const trash = adapter.findTrashButton();
      let trashLabel = null;
      let taughtTrash = false;
      if (trash) {
        trashLabel = adapter.labelOf(trash);
        checkPlace();
        if (!adapter.click(trash)) throw new RunError('page-changed');
      } else if (o.teach) {
        try {
          trashLabel = await o.teach('trash', { place: pin });
        } catch (err) {
          await clearSelection(true);
          throw err;
        }
        checkPlace();
        adapter.useLabel('trash', trashLabel);
        taughtTrash = true;
      } else {
        await clearSelection(true);
        throw new RunError('no-trash-button');
      }

      // From here on the batch is finished even when Stop is pressed, so the
      // count stays true. Google either asks, or moves them straight away.
      // A dialog only counts once it has been the only new one for a moment,
      // so a pop-up that opens next to it is never mistaken for it.
      let candidate = null;
      let candidatePolls = 0;
      let clearedPolls = 0;
      const outcome = await waitFor(function () {
        const fresh = adapter.dialogs().filter(function (d) { return before.indexOf(d) === -1; });
        if (fresh.length > 1) return { many: true };
        if (fresh.length === 1) {
          clearedPolls = 0;
          if (fresh[0] !== candidate) {
            candidate = fresh[0];
            candidatePolls = 0;
          }
          candidatePolls++;
          return candidatePolls * o.poll >= o.dialogSettle ? { dialog: candidate } : null;
        }
        candidate = null;
        candidatePolls = 0;
        if (!adapter.inSelectionMode()) {
          clearedPolls++;
          if (clearedPolls * o.poll >= 1000) return { cleared: true };
        } else {
          clearedPolls = 0;
        }
        return null;
      }, o.stepTimeout, 0, true);
      if (!outcome) {
        await clearSelection(true);
        throw new RunError('no-dialog');
      }
      if (outcome.many) throw new RunError('unexpected-dialog');

      let taughtConfirm = null;
      if (outcome.dialog) {
        const dialog = outcome.dialog;
        if (adapter.dialogForbidden(dialog)) {
          adapter.cancelDialog(dialog);
          await o.sleep(o.settleDelay);
          await clearSelection(true);
          throw new RunError('unsafe-dialog');
        }
        // A trash button learned in this batch may have been the wrong one,
        // so the user confirms its dialog too.
        const confirm = taughtTrash ? null : adapter.findConfirmButton(dialog, trashLabel);
        if (confirm) {
          checkPlace();
          o.log('Confirming with "' + adapter.labelOf(confirm) + '".');
          if (!adapter.click(confirm)) throw new RunError('page-changed');
        } else if (o.teach) {
          try {
            taughtConfirm = await o.teach('confirm', { dialog: dialog, place: pin });
          } catch (err) {
            adapter.cancelDialog(dialog);
            await o.sleep(o.settleDelay);
            await clearSelection(true);
            throw err;
          }
          checkPlace();
        } else {
          o.log('Dialog buttons: ' + adapter.buttonLabels(dialog).join(' | '));
          adapter.cancelDialog(dialog);
          await o.sleep(o.settleDelay);
          await clearSelection(true);
          throw new RunError('no-confirm-button');
        }
        progress('waiting');
        const closed = await waitFor(function () { return !adapter.isOpen(dialog); }, o.trashTimeout, 300, true);
        if (!closed) throw new RunError('trash-timeout');
        // Google drops the selection as soon as the move starts. A selection
        // that stays means the click moved nothing.
        const dropped = await waitFor(function () { return !adapter.inSelectionMode(); }, o.effectTimeout, 500, true);
        if (!dropped) {
          await clearSelection(true);
          throw new RunError('no-effect');
        }
      }

      // Proof that they went: photos are shown again at the top, and none of
      // them is from this batch. An empty grid counts only after a quiet
      // spell, and a longer one unless this batch reached the end of the
      // grid, because a grid that is still loading is empty too.
      progress('verifying');
      adapter.scrollToTop();
      await o.sleep(o.settleDelay);
      const quiet = batch.reachedEnd ? o.emptyQuiet : o.emptyQuiet * 3;
      let emptyPolls = 0;
      const gone = await waitFor(function () {
        const shown = adapter.tiles();
        if (!shown.length) {
          emptyPolls++;
          return emptyPolls * o.poll >= quiet && !adapter.inSelectionMode();
        }
        emptyPolls = 0;
        return !shown.some(function (t) { return probe.has(t.id); });
      }, o.stepTimeout + quiet, 1000, true);
      if (!gone) throw new RunError('not-removed');
      if (taughtTrash) adapter.remember('trash', trashLabel);
      if (taughtConfirm) adapter.remember('confirm', taughtConfirm);
      return counted;
    }

    // limit: Infinity for everything, or a positive whole number.
    // expected: the place the user confirmed; the run refuses any other.
    async function run(limit, expected) {
      if (running) throw new RunError('busy');
      if (!(limit === Infinity || (Number.isInteger(limit) && limit > 0))) throw new RunError('bad-limit');
      running = true;
      stopRequested = false;
      state.trashed = 0;
      state.batches = 0;
      try {
        const page = adapter.page();
        if (!page.ok) throw new RunError(page.reason || 'unsupported-page');
        pin = adapter.place();
        if (!pin.account) throw new RunError('no-account');
        if (expected && !adapter.samePlace(expected)) throw new RunError('page-changed');
        if (expected) pin = expected;
        if (adapter.modalOpen()) throw new RunError('close-popup');
        // Numbers already in the top bar, such as a badge, are not a count.
        adapter.markBaseline();
        await clearSelection(false);
        adapter.markBaseline();
        let reason = 'limit';
        while (state.trashed < limit) {
          if (stopRequested) { reason = 'stopped'; break; }
          const want = Math.min(o.batchSize, limit - state.trashed);
          const batch = await selectBatch(want);
          if (stopRequested) { await clearSelection(true); reason = 'stopped'; break; }
          if (batch.ids.length === 0) { reason = 'empty'; break; }
          const moved = await trashBatch(batch, want);
          state.trashed += moved;
          state.batches++;
          progress('batch-done');
          o.log('Batch ' + state.batches + ': moved ' + moved + ' photos, ' + state.trashed + ' in total.');
          if (state.trashed < limit && !stopRequested) await o.sleep(o.pauseBetweenBatches);
        }
        progress('done');
        return { trashed: state.trashed, batches: state.batches, reason: reason };
      } catch (err) {
        if (err && typeof err === 'object') err.trashed = state.trashed;
        progress('error');
        throw err;
      } finally {
        running = false;
      }
    }

    return {
      run: run,
      stop: function () { stopRequested = true; },
      state: state
    };
  }

  // Everything that touches the Google Photos page lives here. Elements are
  // found by structure and position, not by Google's generated class names.
  function createDomAdapter(doc, win, store, options) {
    const opt = Object.assign({ path: null }, options || {});
    const session = { trash: null, confirm: null };
    let baseline = [];

    function isPanel(el) {
      const panel = doc.getElementById(PANEL_ID);
      return !!(panel && el && panel.contains(el));
    }

    function visible(el) {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const style = win.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    }

    function onScreen(el) {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
    }

    function inTopBar(el) {
      const r = el.getBoundingClientRect();
      return r.top >= -4 && r.bottom <= TOP_BAR_HEIGHT;
    }

    function labelOf(el) {
      if (!el) return '';
      const raw = el.getAttribute('aria-label') || el.getAttribute('title') ||
        (typeof el.innerText === 'string' ? el.innerText : el.textContent) || '';
      return raw.replace(/\s+/g, ' ').trim();
    }

    function actionOf(el) {
      return el.getAttribute('data-mdc-dialog-action');
    }

    function buttonsIn(scope) {
      return Array.prototype.filter.call(scope.querySelectorAll('button, [role="button"]'),
        function (b) { return !isPanel(b); });
    }

    function topButtons() {
      return buttonsIn(doc).filter(function (b) { return visible(b) && inTopBar(b); });
    }

    function learned(kind) {
      return session[kind] || store.get(kind + 'Label');
    }

    function currentPath() {
      if (typeof opt.path === 'function') return opt.path();
      return opt.path !== null ? opt.path : win.location.pathname;
    }

    function page() {
      const match = /^\/(?:u\/\d+\/?)?(?:(archive)\/?)?$/.exec(currentPath());
      if (!match) return { ok: false, reason: 'unsupported-page' };
      return { ok: true, kind: match[1] ? 'archive' : 'library' };
    }

    // The signed-in account, from the account button in the top bar. Other
    // "@" labels on the page only count when that button is not drawn.
    function account() {
      const nodes = doc.querySelectorAll('[aria-label*="@"]');
      let fallback = null;
      for (let i = 0; i < nodes.length; i++) {
        if (isPanel(nodes[i])) continue;
        const match = EMAIL.exec(nodes[i].getAttribute('aria-label'));
        if (!match) continue;
        if (visible(nodes[i]) && inTopBar(nodes[i])) return match[0];
        if (!fallback) fallback = match[0];
      }
      return fallback;
    }

    function place() {
      const info = page();
      return { ok: info.ok, kind: info.kind || null, path: currentPath(), account: account() };
    }

    // Same page, same path and, when the account can be seen, same account.
    function samePlace(pinned) {
      if (!pinned) return false;
      const now = place();
      if (!now.ok || now.path !== pinned.path) return false;
      return !now.account || !pinned.account || now.account === pinned.account;
    }

    function isHidden() {
      return doc.visibilityState === 'hidden';
    }

    // Google keeps earlier pages in the DOM, hidden. Only the visible main
    // area counts.
    function mainArea() {
      const mains = Array.prototype.filter.call(doc.querySelectorAll('[role="main"]'), visible);
      return mains.find(function (m) { return m.scrollHeight > m.clientHeight + 1; }) || mains[0] || null;
    }

    function scroller() {
      const main = mainArea();
      if (main && main.scrollHeight > main.clientHeight + 1) return main;
      return doc.scrollingElement || doc.documentElement;
    }

    // A photo tile is a checkbox whose parent also holds exactly one link to
    // a photo. Day headers have a checkbox too, but no photo link.
    function tiles() {
      const scope = mainArea() || doc.body;
      const out = [];
      const boxes = scope.querySelectorAll('[role="checkbox"]');
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const parent = box.parentElement;
        if (!parent || isPanel(box)) continue;
        const links = parent.querySelectorAll('a[href*="photo/"]');
        if (links.length !== 1) continue;
        const id = ((links[0].getAttribute('href') || '').split('photo/')[1] || '').split(/[?#/]/)[0];
        if (!id) continue;
        out.push({ id: id, checkbox: box, checked: box.getAttribute('aria-checked') === 'true' });
      }
      return out;
    }

    function anyPresent(ids) {
      const wanted = new Set(ids);
      return tiles().some(function (t) { return wanted.has(t.id); });
    }

    // The one way this tool clicks anything on the page. It refuses unless
    // the page is the Library or the Archive, and it never clicks a button
    // that empties the trash or deletes for good.
    function click(el) {
      if (!el || !el.isConnected || !page().ok) return false;
      if (el.getAttribute('role') !== 'checkbox' && forbidden(labelOf(el))) return false;
      el.click();
      return true;
    }

    function scrollToTop() {
      scroller().scrollTop = 0;
    }

    function scrollDown() {
      const s = scroller();
      const before = s.scrollTop;
      s.scrollTop = before + Math.max(200, Math.floor(s.clientHeight * 0.8));
      return s.scrollTop > before;
    }

    // Account buttons carry the email address and a person's name, which can
    // hold a trash word ("bin"), so labels with "@" never count.
    function trashCandidate(label) {
      return label.indexOf('@') === -1 && !forbidden(label);
    }

    function findTrashButton() {
      const buttons = topButtons().filter(function (b) { return trashCandidate(labelOf(b)); });
      const known = learned('trash');
      if (known) {
        const hit = buttons.filter(function (b) { return labelOf(b) === known; });
        if (hit.length === 1) return hit[0];
      }
      const hits = buttons.filter(function (b) { return TRASH_WORDS.test(labelOf(b)); });
      return hits.length === 1 ? hits[0] : null;
    }

    // The containers that make up the top bar: for each top-bar button, its
    // highest ancestor that still fits inside the bar.
    function topBars() {
      const bars = [];
      topButtons().forEach(function (b) {
        let el = b;
        while (el.parentElement && el.parentElement !== doc.body) {
          const r = el.parentElement.getBoundingClientRect();
          if (r.bottom > TOP_BAR_HEIGHT + 8 || r.height > TOP_BAR_HEIGHT + 8) break;
          el = el.parentElement;
        }
        if (bars.indexOf(el) === -1) bars.push(el);
      });
      return bars;
    }

    // Short texts in the top bar with a number and a word, outside buttons:
    // "5 geselecteerd", "5 selected". A bare badge like "3" never counts.
    function countCandidates() {
      const found = [];
      topBars().forEach(function (bar) {
        const nodes = bar.querySelectorAll('span, div, h1, h2, h3, p');
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (el.children.length || isPanel(el)) continue;
          if (el.closest('button, [role="button"], a, input')) continue;
          const text = (el.textContent || '').trim();
          if (!text || text.length > 40 || !/\d/.test(text) || !/\p{L}/u.test(text)) continue;
          if (!visible(el) || !inTopBar(el)) continue;
          const n = parseCount(text);
          if (n !== null && found.every(function (f) { return f.el !== el; })) found.push({ el: el, n: n });
        }
      });
      return found;
    }

    // The "N selected" text, skipping any number that was already in the
    // top bar before the run ticked anything.
    function countElement() {
      const found = countCandidates().filter(function (c) { return baseline.indexOf(c.el) === -1; });
      return found.length ? found[0] : null;
    }

    function markBaseline() {
      baseline = findTrashButton() ? [] : countCandidates().map(function (c) { return c.el; });
    }

    function selectionCount() {
      const found = countElement();
      return found ? found.n : null;
    }

    function inSelectionMode() {
      if (findTrashButton()) return true;
      const found = countElement();
      return !!found && found.n > 0;
    }

    // "Clear selection" is the top-bar button right next to the count, on
    // either side, so it does not matter which way the language reads.
    function clearButton() {
      const found = countElement();
      if (!found) return null;
      const trash = findTrashButton();
      const c = found.el.getBoundingClientRect();
      let best = null;
      let bestGap = 120;
      topButtons().forEach(function (b) {
        const label = labelOf(b);
        if (b === trash || TRASH_WORDS.test(label) || !trashCandidate(label)) return;
        const r = b.getBoundingClientRect();
        const gap = Math.max(r.left - c.right, c.left - r.right, 0);
        if (gap < bestGap) { best = b; bestGap = gap; }
      });
      return best;
    }

    function pressEscape() {
      const target = doc.activeElement && !isPanel(doc.activeElement) ? doc.activeElement : doc.body;
      ['keydown', 'keyup'].forEach(function (type) {
        target.dispatchEvent(new win.KeyboardEvent(type, {
          key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true
        }));
      });
    }

    function clearSelection(useEscape) {
      if (!useEscape) {
        const button = clearButton();
        if (button && click(button)) return;
      }
      pressEscape();
    }

    function dialogs() {
      return Array.prototype.filter.call(
        doc.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'),
        function (d) { return onScreen(d) && !isPanel(d); });
    }

    function modalOpen() {
      return dialogs().some(function (d) {
        return d.getAttribute('aria-modal') === 'true' || d.getAttribute('role') === 'alertdialog' ||
          d.tagName === 'DIALOG';
      });
    }

    function isOpen(dialog) {
      return onScreen(dialog);
    }

    // A dialog whose own text speaks of emptying the trash or of deleting
    // for good is never confirmed, whatever its buttons say. The text pieces
    // are joined with spaces: the browser runs "Cancel" and "Empty trash"
    // together into "CancelEmpty trash", which hides the word "empty".
    function dialogForbidden(dialog) {
      const parts = [];
      const walker = doc.createTreeWalker(dialog, 4); // 4: text nodes only
      while (walker.nextNode()) parts.push(walker.currentNode.data);
      buttonsIn(dialog).forEach(function (b) { parts.push(labelOf(b)); });
      return forbidden(parts.join(' '));
    }

    // Google's accept code finds the confirm button in any language, but only
    // in a dialog that also has Google's cancel code, as the trash dialog has.
    // A label learned from the user, or the same label as the trash button,
    // is the fallback. Cancel and forbidden buttons never qualify.
    function findConfirmButton(dialog, trashLabel) {
      const all = buttonsIn(dialog).filter(visible);
      const buttons = all.filter(function (b) {
        return !forbidden(labelOf(b)) && actionOf(b) !== CANCEL_ACTION;
      });
      const accept = buttons.filter(function (b) { return actionOf(b) === ACCEPT_ACTION; });
      const cancel = all.filter(function (b) { return actionOf(b) === CANCEL_ACTION; });
      if (accept.length === 1 && cancel.length === 1) return accept[0];
      const known = learned('confirm');
      if (known) {
        const hit = buttons.filter(function (b) { return labelOf(b) === known; });
        if (hit.length === 1) return hit[0];
      }
      const want = String(trashLabel || '').toLowerCase();
      if (want) {
        const same = buttons.filter(function (b) { return labelOf(b).toLowerCase() === want; });
        if (same.length === 1) return same[0];
      }
      return null;
    }

    function buttonLabels(dialog) {
      return buttonsIn(dialog).filter(visible).map(labelOf);
    }

    // Backs out of a dialog without confirming: Google's own Cancel button
    // when it is there, otherwise the Escape key.
    function cancelDialog(dialog) {
      const cancel = buttonsIn(dialog).filter(visible).filter(function (b) {
        return actionOf(b) === CANCEL_ACTION;
      });
      if (cancel.length === 1 && click(cancel[0])) return;
      pressEscape();
    }

    function useLabel(kind, label) {
      session[kind] = label;
    }

    function remember(kind, label) {
      session[kind] = label;
      store.set(kind + 'Label', label);
    }

    function hasLearned() {
      return !!(store.get('trashLabel') || store.get('confirmLabel'));
    }

    function forget() {
      session.trash = null;
      session.confirm = null;
      store.remove('trashLabel');
      store.remove('confirmLabel');
    }

    return {
      page: page,
      place: place,
      samePlace: samePlace,
      account: account,
      isHidden: isHidden,
      modalOpen: modalOpen,
      tiles: tiles,
      anyPresent: anyPresent,
      click: click,
      scrollToTop: scrollToTop,
      scrollDown: scrollDown,
      findTrashButton: findTrashButton,
      markBaseline: markBaseline,
      inSelectionMode: inSelectionMode,
      selectionCount: selectionCount,
      clearButton: clearButton,
      dialogs: dialogs,
      isOpen: isOpen,
      dialogForbidden: dialogForbidden,
      findConfirmButton: findConfirmButton,
      buttonLabels: buttonLabels,
      cancelDialog: cancelDialog,
      labelOf: labelOf,
      forbidden: forbidden,
      inTopBar: inTopBar,
      pressEscape: pressEscape,
      clearSelection: clearSelection,
      useLabel: useLabel,
      remember: remember,
      hasLearned: hasLearned,
      forget: forget
    };
  }

  // Builds elements node by node, never from an HTML string: photos.google.com
  // enforces Trusted Types, which blocks those.
  function h(doc, tag, props, children) {
    const el = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      const value = props[key];
      if (value === null || value === undefined) return;
      if (key === 'style') Object.assign(el.style, value);
      else if (key === 'text') el.textContent = value;
      else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    });
    return el;
  }

  const STYLE = {
    panel: {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483000',
      font: '13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      color: '#e8eaed', textAlign: 'left', direction: 'ltr'
    },
    card: {
      width: '320px', boxSizing: 'border-box', padding: '14px 16px', background: '#202124',
      border: '1px solid #3c4043', borderRadius: '12px', boxShadow: '0 8px 28px rgba(0,0,0,0.45)'
    },
    pill: {
      padding: '8px 14px', background: '#202124', color: '#e8eaed', border: '1px solid #3c4043',
      borderRadius: '18px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', cursor: 'pointer', font: 'inherit'
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
    title: { fontSize: '14px', fontWeight: '600' },
    link: {
      background: 'none', border: 'none', color: '#8ab4f8', cursor: 'pointer', font: 'inherit',
      padding: '0', textDecoration: 'none'
    },
    row: { display: 'flex', gap: '8px', margin: '2px 0' },
    key: { width: '64px', flex: 'none', color: '#9aa0a6' },
    value: { overflowWrap: 'anywhere' },
    label: { display: 'block', margin: '12px 0 4px', color: '#9aa0a6' },
    input: {
      width: '100%', boxSizing: 'border-box', padding: '7px 9px', background: '#303134', color: '#e8eaed',
      border: '1px solid #5f6368', borderRadius: '8px', font: 'inherit'
    },
    hint: { margin: '4px 0 0', color: '#9aa0a6', fontSize: '12px' },
    buttons: { display: 'flex', gap: '8px', marginTop: '12px' },
    primary: {
      flex: '1', padding: '8px 12px', background: '#d93025', color: '#fff', border: 'none',
      borderRadius: '8px', cursor: 'pointer', font: 'inherit', fontWeight: '600'
    },
    secondary: {
      flex: '1', padding: '8px 12px', background: 'transparent', color: '#e8eaed',
      border: '1px solid #5f6368', borderRadius: '8px', cursor: 'pointer', font: 'inherit'
    },
    message: { margin: '12px 0 0' },
    error: { margin: '12px 0 0', color: '#f28b82' },
    log: {
      margin: '10px 0 0', padding: '6px 8px', background: '#171717', borderRadius: '6px',
      color: '#9aa0a6', fontSize: '11px', maxHeight: '96px', overflow: 'auto', whiteSpace: 'pre-wrap'
    },
    footer: {
      display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: '#9aa0a6',
      fontSize: '11px'
    }
  };

  const PHASES = {
    selecting: 'Selecting photos',
    checking: 'Checking the selection',
    trashing: 'Moving to the trash',
    waiting: 'Waiting for Google',
    verifying: 'Checking that they are gone',
    paused: 'Paused while this tab is hidden. Keep it in front',
    'batch-done': 'Next batch',
    done: 'Done',
    error: 'Stopped'
  };

  function mountPanel(doc, win) {
    if (!doc.body || doc.getElementById(PANEL_ID)) return null;
    const store = createStore(win);
    const adapter = createDomAdapter(doc, win, store);
    let view = 'idle';
    let limitValue = '';
    let inputError = '';
    let result = null;
    let runner = null;
    let confirmedPlace = null;
    let pendingTeach = null;
    let teachText = '';
    let progressText = '';
    const logLines = [];
    let logEl = null;
    let progressEl = null;
    let lastSignature = '';

    const panel = h(doc, 'div', { id: PANEL_ID, style: STYLE.panel });
    const pill = h(doc, 'button', { type: 'button', style: STYLE.pill, text: 'Bulk Delete' });
    const card = h(doc, 'div', { style: STYLE.card, role: 'region', 'aria-label': NAME });
    pill.addEventListener('click', function () { setCollapsed(false); });
    panel.appendChild(pill);
    panel.appendChild(card);
    // Keys typed in the panel must not reach the keyboard shortcuts of Google Photos.
    ['keydown', 'keypress', 'keyup'].forEach(function (type) {
      panel.addEventListener(type, function (e) { e.stopPropagation(); });
    });
    doc.body.appendChild(panel);

    function log(line) {
      logLines.push(line);
      if (logLines.length > 30) logLines.shift();
      if (win.console && win.console.log) win.console.log('[' + NAME + '] ' + line);
      if (logEl) {
        logEl.textContent = logLines.join('\n');
        logEl.scrollTop = logEl.scrollHeight;
      }
    }

    function setCollapsed(collapsed) {
      if (collapsed && (view === 'running' || view === 'confirm')) return;
      store.set('collapsed', collapsed ? '1' : '0');
      render();
    }

    function trashUrl() {
      const match = /^\/u\/\d+/.exec(win.location.pathname);
      return 'https://photos.google.com' + (match ? match[0] : '') + '/trash';
    }

    function where() {
      const info = adapter.page();
      return info.ok && info.kind === 'archive' ? 'Archive' : 'Library';
    }

    function fail(code) {
      result = { ok: false, trashed: 0, reason: code, message: MESSAGES[code] };
      view = 'error';
      render();
    }

    // Asks the user to click a button once. Only a real click counts, only
    // on the page that was confirmed, and never on a button that empties the
    // trash. The trash button must sit in the top bar, the confirm button in
    // the dialog. A click on the dialog's Cancel stops the run.
    function teach(kind, ctx) {
      return new Promise(function (resolve, reject) {
        teachText = kind === 'trash'
          ? 'I cannot find the trash button in this language. Click the trash button in the top bar of Google Photos once. I will remember it.'
          : 'Click the button in the Google dialog that moves the photos to the trash. I will remember it.';
        render();
        function finish() {
          doc.removeEventListener('click', onClick, true);
          pendingTeach = null;
          teachText = '';
        }
        function onClick(event) {
          if (!event.isTrusted) return;
          const target = event.target && event.target.closest ? event.target.closest('button, [role="button"]') : null;
          if (!target || panel.contains(target)) return;
          if (ctx && ctx.place && !adapter.samePlace(ctx.place)) return;
          const label = adapter.labelOf(target);
          if (kind === 'confirm') {
            if (!ctx || !ctx.dialog || !ctx.dialog.contains(target)) return;
            if (target.getAttribute('data-mdc-dialog-action') === CANCEL_ACTION) {
              finish();
              render();
              reject(new RunError('stopped'));
              return;
            }
          } else if (!adapter.inTopBar(target) || label.indexOf('@') !== -1) {
            return;
          }
          if (!label || adapter.forbidden(label)) return;
          finish();
          log('Learned the ' + kind + ' button: "' + label + '".');
          render();
          resolve(label);
        }
        doc.addEventListener('click', onClick, true);
        pendingTeach = function () {
          finish();
          reject(new RunError('stopped'));
        };
      });
    }

    function start() {
      const limit = parseLimit(limitValue);
      if (limit === null) { fail('bad-limit'); return; }
      if (!confirmedPlace || !adapter.samePlace(confirmedPlace)) { fail('page-changed'); return; }
      view = 'running';
      result = null;
      progressText = 'Starting';
      logLines.length = 0;
      render();
      runner = createRunner(adapter, {
        log: log,
        teach: teach,
        onProgress: function (s) {
          progressText = (PHASES[s.phase] || s.phase) + '. Moved so far: ' + s.trashed + '.';
          if (progressEl) progressEl.textContent = progressText;
        }
      });
      log('Started: ' + (limit === Infinity ? 'all photos' : limit + ' photos') + ' in the ' + where() +
        ' of ' + confirmedPlace.account + '.');
      runner.run(limit, confirmedPlace).then(function (res) {
        result = { ok: true, trashed: res.trashed, reason: res.reason };
        view = 'done';
        render();
      }, function (err) {
        const code = err && err.code ? err.code : 'unknown';
        result = {
          ok: code === 'stopped', trashed: err && err.trashed ? err.trashed : 0, reason: code,
          message: err && err.message
        };
        view = code === 'stopped' ? 'done' : 'error';
        if (code !== 'stopped') log('Error: ' + (err && err.message ? err.message : String(err)));
        render();
      });
    }

    function stop() {
      if (runner) runner.stop();
      if (pendingTeach) pendingTeach();
      progressText = 'Stopping after this step';
      if (progressEl) progressEl.textContent = progressText;
    }

    function row(key, value) {
      return h(doc, 'div', { style: STYLE.row }, [
        h(doc, 'span', { style: STYLE.key, text: key }),
        h(doc, 'span', { style: STYLE.value, text: value })
      ]);
    }

    function button(text, style, onClick, disabled) {
      const b = h(doc, 'button', { type: 'button', style: style, text: text, onclick: onClick });
      if (disabled) {
        b.disabled = true;
        b.style.opacity = '0.5';
        b.style.cursor = 'default';
      }
      return b;
    }

    function trashLink() {
      return h(doc, 'a', { href: trashUrl(), style: STYLE.link, text: 'Open the trash' });
    }

    function body() {
      const info = adapter.page();
      const email = adapter.account();
      const parts = [
        row('Account', email || 'unknown'),
        row('Page', info.ok ? where() : 'not supported here')
      ];

      if (view === 'idle') {
        // A text box, not a number box: a number box reports "5-" as empty,
        // and empty means all.
        const input = h(doc, 'input', {
          type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'all',
          'aria-label': 'How many photos', style: STYLE.input
        });
        input.value = limitValue;
        input.addEventListener('input', function () { limitValue = input.value; });
        parts.push(
          h(doc, 'label', { style: STYLE.label, text: 'How many photos' }),
          input,
          h(doc, 'p', { style: STYLE.hint, text: 'Leave empty to move all of them.' }),
          h(doc, 'div', { style: STYLE.buttons }, [
            button('Move to trash', STYLE.primary, function () {
              if (parseLimit(limitValue) === null) { inputError = MESSAGES['bad-limit']; render(); return; }
              inputError = '';
              if (!adapter.page().ok) { fail('unsupported-page'); return; }
              if (!adapter.account()) { fail('no-account'); return; }
              if (adapter.modalOpen()) { fail('close-popup'); return; }
              confirmedPlace = adapter.place();
              view = 'confirm';
              render();
            }, !info.ok)
          ])
        );
        if (inputError) parts.push(h(doc, 'p', { style: STYLE.error, text: inputError }));
        if (!info.ok) parts.push(h(doc, 'p', { style: STYLE.hint, text: MESSAGES['unsupported-page'] }));
      }

      if (view === 'confirm') {
        const limit = parseLimit(limitValue);
        const what = limit === Infinity ? 'ALL photos' : limit + ' photo' + (limit === 1 ? '' : 's');
        parts.push(
          h(doc, 'p', { style: STYLE.message, text: 'Move ' + what + ' from the ' + where() + ' of ' + confirmedPlace.account + ' to the trash?' }),
          h(doc, 'p', { style: STYLE.hint, text: 'You can restore them from the trash for 60 days. Keep this tab open and in front while it runs.' }),
          h(doc, 'div', { style: STYLE.buttons }, [
            button('Yes, move them', STYLE.primary, start),
            button('Cancel', STYLE.secondary, function () { view = 'idle'; render(); })
          ])
        );
      }

      if (view === 'running') {
        progressEl = h(doc, 'p', { style: STYLE.message, text: progressText });
        parts.push(progressEl);
        if (teachText) parts.push(h(doc, 'p', { style: STYLE.error, text: teachText }));
        parts.push(h(doc, 'div', { style: STYLE.buttons }, [button('Stop', STYLE.secondary, stop)]));
      } else {
        progressEl = null;
      }

      if (view === 'done' || view === 'error') {
        const moved = result && result.trashed ? result.trashed : 0;
        let text = 'Moved ' + moved + ' photo' + (moved === 1 ? '' : 's') + ' to the trash.';
        if (result && result.reason === 'empty') {
          text = moved ? text + ' Nothing is left in your ' + where() + '.' : 'Found no photos to move here.';
        }
        if (result && result.reason === 'stopped') text = 'Stopped. ' + text;
        if (view === 'error') {
          parts.push(h(doc, 'p', { style: STYLE.error, text: (result && result.message) || 'Something went wrong.' }));
          if (moved) parts.push(h(doc, 'p', { style: STYLE.message, text: text }));
        } else {
          parts.push(h(doc, 'p', { style: STYLE.message, text: text }));
        }
        if (moved) {
          parts.push(h(doc, 'p', { style: STYLE.hint }, [
            'They stay in the trash for 60 days. To delete them for good, empty the trash yourself. ',
            trashLink()
          ]));
        }
        parts.push(h(doc, 'div', { style: STYLE.buttons }, [
          button('Back', STYLE.secondary, function () { view = 'idle'; render(); })
        ]));
      }

      if (view !== 'idle' && view !== 'confirm') {
        logEl = h(doc, 'div', { style: STYLE.log, 'aria-live': 'polite', text: logLines.join('\n') });
        parts.push(logEl);
      } else {
        logEl = null;
      }

      const footerLeft = adapter.hasLearned() && view !== 'running'
        ? button('Forget learned buttons', STYLE.link, function () { adapter.forget(); render(); })
        : h(doc, 'span', { text: '' });
      parts.push(h(doc, 'div', { style: STYLE.footer }, [
        footerLeft,
        h(doc, 'a', { href: REPO_URL, target: '_blank', rel: 'noopener noreferrer', style: STYLE.link, text: 'v' + VERSION })
      ]));
      return parts;
    }

    function signature() {
      const info = adapter.page();
      return (adapter.account() || '') + '|' + (info.ok ? info.kind : 'none') + '|' + win.location.pathname;
    }

    function render() {
      lastSignature = signature();
      const collapsed = store.get('collapsed') === '1' && view !== 'running' && view !== 'confirm';
      pill.style.display = collapsed ? 'inline-block' : 'none';
      card.style.display = collapsed ? 'none' : 'block';
      if (collapsed) return;
      const header = h(doc, 'div', { style: STYLE.header }, [
        h(doc, 'span', { style: STYLE.title, text: NAME }),
        view === 'running' || view === 'confirm'
          ? h(doc, 'span', { text: '' })
          : button('Hide', STYLE.link, function () { setCollapsed(true); })
      ]);
      card.replaceChildren.apply(card, [header].concat(body()));
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }

    render();
    // Google Photos changes pages without reloading. Redraw when the account
    // or the page changes, and only then: a redraw replaces the buttons, and
    // a click that lands during one would be lost. A change while the user
    // is confirming cancels the confirmation, so it is always asked again.
    win.setInterval(function () {
      if (view !== 'idle' && view !== 'confirm') return;
      if (signature() === lastSignature) return;
      if (view === 'confirm') {
        view = 'idle';
        render();
        return;
      }
      if (doc.activeElement && panel.contains(doc.activeElement)) return;
      if (store.get('collapsed') === '1') return;
      render();
    }, 1000);
    return { panel: panel, adapter: adapter };
  }

  const api = {
    VERSION: VERSION,
    NAME: NAME,
    TRASH_WORDS: TRASH_WORDS,
    EMPTY_WORDS: EMPTY_WORDS,
    PERMANENT_WORDS: PERMANENT_WORDS,
    MESSAGES: MESSAGES,
    RunError: RunError,
    forbidden: forbidden,
    parseCount: parseCount,
    parseLimit: parseLimit,
    createStore: createStore,
    createRunner: createRunner,
    createDomAdapter: createDomAdapter,
    mountPanel: mountPanel
  };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
    return;
  }
  root.BulkDeleteForGooglePhotos = api;
  if (root.document && !root.BULK_DELETE_NO_AUTOMOUNT) {
    const mount = function () { mountPanel(root.document, root); };
    if (root.document.body) mount();
    else root.document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : globalThis);
