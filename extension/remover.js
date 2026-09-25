/*
 * Free Photos Remover for Google Photos
 *
 * Moves photos from your Google Photos Library or Archive to the trash in
 * bulk, free and without a daily limit. It clicks the same checkboxes and
 * buttons you would click yourself. It never empties the trash, sends nothing
 * anywhere and needs no browser permissions.
 *
 * Use it as a browser extension (see README.md), or paste this whole file into
 * the browser console on photos.google.com.
 *
 * MIT licence. https://github.com/JasonKrijgsman/free-photos-remover
 * Not affiliated with or endorsed by Google.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const PANEL_ID = 'free-photos-remover';
  const STORE_PREFIX = 'freePhotosRemover.';
  const REPO_URL = 'https://github.com/JasonKrijgsman/free-photos-remover';

  // Google Photos keeps its top bar, and the selection bar that replaces it,
  // in the top 64 CSS pixels. Buttons lower on the page are never clicked.
  const TOP_BAR_HEIGHT = 72;

  // The word for "trash" in the label of the trash button, per language.
  // A label learned from the user's own click always wins over this list.
  const TRASH_WORDS = new RegExp([
    '\\btrash\\b', '\\bbin\\b', 'prullenbak', 'papierkorb', 'corbeille', 'papelera', 'paperera',
    'cestino', 'lixeira', 'lixo', 'kosz', 'koš', 'papperskorg', 'papirkurv', 'roskakori',
    'prügikast', 'šiukšliadėž', 'atkritn', 'kuk[aá]', 'co[șş]', 'otpad', 'smetnjak', 'çöp',
    'sampah', 'basurahan', 'thùng rác', 'корзин', 'кошик', 'кошче', 'отпад', 'κάδο', 'אשפה',
    'المهملات', 'ट्रैश', 'ถังขยะ', 'ゴミ箱', '휴지통', '回收站', '垃圾桶'
  ].join('|'), 'iu');

  const MESSAGES = {
    'unsupported-page': 'Open your Photos library or your Archive first.',
    'close-popup': 'Close the Google Photos pop-up first, then start again.',
    'page-changed': 'The page changed while it was running.',
    'clear-failed': 'Could not clear the current selection. Clear it yourself and start again.',
    'select-failed': 'Could not select any photos.',
    'too-many': 'Google selected more photos than planned, so nothing from that batch was moved. Stopped to be safe.',
    'no-trash-button': 'Could not find the trash button.',
    'no-dialog': 'Google did not react to the trash button.',
    'no-confirm-button': 'Could not find the confirm button in the Google dialog. Nothing from that batch was moved.',
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
      trashTimeout: 120000,
      pauseBetweenBatches: 1000,
      maxIdleScrolls: 3,
      sleep: sleep,
      log: function () {},
      onProgress: function () {},
      teach: null
    }, options || {});

    let stopRequested = false;
    let running = false;
    const state = { trashed: 0, batches: 0, phase: 'idle' };

    function progress(phase) {
      state.phase = phase;
      o.onProgress(Object.assign({}, state));
    }

    // Polls check() until it returns something truthy, for at most timeout
    // ms. With stableFor, the value must hold that long without a break.
    async function waitFor(check, timeout, stableFor, ignoreStop) {
      const tries = Math.max(1, Math.ceil(timeout / o.poll));
      const needed = Math.max(1, Math.ceil((stableFor || 0) / o.poll));
      let streak = 0;
      for (let i = 0; i < tries; i++) {
        if (stopRequested && !ignoreStop) throw new RunError('stopped');
        const value = check();
        if (value) {
          streak++;
          if (streak >= needed) return value;
        } else {
          streak = 0;
        }
        await o.sleep(o.poll);
      }
      return null;
    }

    async function clearSelection() {
      if (!adapter.inSelectionMode()) return;
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
      adapter.scrollToTop();
      await o.sleep(o.settleDelay);
      const ids = [];
      const seen = new Set();
      let idle = 0;
      let staleRounds = 0;
      while (ids.length < want && !stopRequested) {
        if (!adapter.page().ok) throw new RunError('page-changed');
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
          if (idle >= o.maxIdleScrolls) break;
        } else {
          idle = 0;
        }
      }
      return ids;
    }

    async function trashBatch(ids, want) {
      progress('checking');
      await o.sleep(o.settleDelay);

      // Safety check: Google's own count must not exceed what was planned.
      const counted = adapter.selectionCount();
      o.log('Ticked ' + ids.length + ' photos. Google shows ' +
        (counted === null ? 'no count' : counted + ' selected') + '.');
      if (counted !== null && counted > want) {
        await clearSelection();
        throw new RunError('too-many', { counted: counted, want: want });
      }
      const expected = counted !== null ? counted : ids.length;
      if (expected <= 0) {
        await clearSelection();
        throw new RunError('select-failed');
      }

      // Each batch starts at the top of the grid, so its first photos are the
      // ones shown at the top afterwards if Google did not remove them.
      const probe = ids.slice(0, 12);

      progress('trashing');
      const before = adapter.dialogs();
      const trash = adapter.findTrashButton();
      let trashLabel = null;
      let taughtTrash = false;
      if (trash) {
        trashLabel = adapter.labelOf(trash);
        adapter.click(trash);
      } else if (o.teach) {
        trashLabel = await o.teach('trash');
        adapter.useLabel('trash', trashLabel);
        taughtTrash = true;
      } else {
        await clearSelection();
        throw new RunError('no-trash-button');
      }

      // Google either asks to confirm, or moves the photos straight away.
      let clearedPolls = 0;
      const outcome = await waitFor(function () {
        const fresh = adapter.dialogs().filter(function (d) { return before.indexOf(d) === -1; });
        if (fresh.length) {
          // If some other pop-up opened too, prefer the dialog that offers
          // the trash button.
          const best = fresh.find(function (d) { return adapter.findConfirmButton(d, trashLabel); });
          return { dialog: best || fresh[fresh.length - 1] };
        }
        if (!adapter.inSelectionMode()) {
          clearedPolls++;
          if (clearedPolls * o.poll >= 1000) return { cleared: true };
        } else {
          clearedPolls = 0;
        }
        return null;
      }, o.stepTimeout);
      if (!outcome) {
        await clearSelection();
        throw new RunError('no-dialog');
      }

      let taughtConfirm = null;
      if (outcome.dialog) {
        const confirm = adapter.findConfirmButton(outcome.dialog, trashLabel);
        if (confirm) {
          o.log('Confirming with "' + adapter.labelOf(confirm) + '".');
          adapter.click(confirm);
        } else if (o.teach) {
          taughtConfirm = await o.teach('confirm', { dialog: outcome.dialog });
        } else {
          o.log('Dialog buttons: ' + adapter.buttonLabels(outcome.dialog).join(' | '));
          adapter.pressEscape();
          await o.sleep(o.settleDelay);
          await clearSelection();
          throw new RunError('no-confirm-button');
        }
        progress('waiting');
        const done = await waitFor(function () {
          return !adapter.isOpen(outcome.dialog) && !adapter.inSelectionMode();
        }, o.trashTimeout, 500);
        if (!done) throw new RunError('trash-timeout');
      }

      progress('verifying');
      adapter.scrollToTop();
      await o.sleep(o.settleDelay);
      const gone = await waitFor(function () { return !adapter.anyPresent(probe); }, o.stepTimeout, 1000);
      if (!gone) throw new RunError('not-removed');
      if (taughtTrash) adapter.remember('trash', trashLabel);
      if (taughtConfirm) adapter.remember('confirm', taughtConfirm);
      return expected;
    }

    async function run(limit) {
      if (running) throw new RunError('busy');
      const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Infinity;
      running = true;
      stopRequested = false;
      state.trashed = 0;
      state.batches = 0;
      try {
        const page = adapter.page();
        if (!page.ok) throw new RunError(page.reason || 'unsupported-page');
        if (adapter.modalOpen()) throw new RunError('close-popup');
        await clearSelection();
        let reason = 'limit';
        while (state.trashed < max) {
          if (stopRequested) { reason = 'stopped'; break; }
          const want = Math.min(o.batchSize, max - state.trashed);
          const ids = await selectBatch(want);
          if (stopRequested) { await clearSelection(); reason = 'stopped'; break; }
          if (ids.length === 0) { reason = 'empty'; break; }
          const moved = await trashBatch(ids, want);
          state.trashed += moved;
          state.batches++;
          progress('batch-done');
          o.log('Batch ' + state.batches + ': moved ' + moved + ' photos, ' + state.trashed + ' in total.');
          if (state.trashed < max && !stopRequested) await o.sleep(o.pauseBetweenBatches);
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

    function labelOf(el) {
      if (!el) return '';
      const raw = el.getAttribute('aria-label') || el.getAttribute('title') ||
        (typeof el.innerText === 'string' ? el.innerText : el.textContent) || '';
      return raw.replace(/\s+/g, ' ').trim();
    }

    function buttonsIn(scope) {
      return Array.prototype.filter.call(scope.querySelectorAll('button, [role="button"]'),
        function (b) { return !isPanel(b); });
    }

    function topButtons() {
      return buttonsIn(doc).filter(function (b) {
        if (!visible(b)) return false;
        const r = b.getBoundingClientRect();
        return r.top >= -4 && r.bottom <= TOP_BAR_HEIGHT;
      });
    }

    function learned(kind) {
      return session[kind] || store.get(kind + 'Label');
    }

    function page() {
      const path = opt.path !== null ? opt.path : win.location.pathname;
      const match = /^\/(?:u\/\d+\/?)?(?:(archive)\/?)?$/.exec(path);
      if (!match) return { ok: false, reason: 'unsupported-page' };
      return { ok: true, kind: match[1] ? 'archive' : 'library' };
    }

    function account() {
      const nodes = doc.querySelectorAll('[aria-label*="@"]');
      for (let i = 0; i < nodes.length; i++) {
        const match = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(nodes[i].getAttribute('aria-label'));
        if (match) return match[0];
      }
      return null;
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

    // Returns false when the element is no longer on the page.
    function click(el) {
      if (!el || !el.isConnected) return false;
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

    function findTrashButton() {
      const buttons = topButtons();
      const known = learned('trash');
      if (known) {
        const hit = buttons.find(function (b) { return labelOf(b) === known; });
        if (hit) return hit;
      }
      const hits = buttons.filter(function (b) { return TRASH_WORDS.test(labelOf(b)); });
      return hits.length === 1 ? hits[0] : null;
    }

    function inSelectionMode() {
      return !!findTrashButton();
    }

    // Reads "N selected" from the selection bar: the first short text with a
    // number in the top bar, left of the trash button.
    function selectionCount() {
      const trash = findTrashButton();
      if (!trash) return null;
      const limitX = trash.getBoundingClientRect().left;
      let scope = trash;
      while (scope.parentElement && scope.parentElement !== doc.body) {
        scope = scope.parentElement;
        const r = scope.getBoundingClientRect();
        if (r.left <= 120 || r.bottom > TOP_BAR_HEIGHT + 8) break;
      }
      const nodes = scope.querySelectorAll('span, div, h1, h2, h3, p');
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.children.length || isPanel(el)) continue;
        const text = (el.textContent || '').trim();
        if (!text || text.length > 40 || !/\d/.test(text) || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom > TOP_BAR_HEIGHT || r.left >= limitX) continue;
        const n = parseCount(text);
        if (n !== null) return n;
      }
      return null;
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

    // The confirm button carries the same label as the trash button in every
    // language seen so far. Cancel never matches.
    function findConfirmButton(dialog, trashLabel) {
      const buttons = buttonsIn(dialog).filter(visible);
      const known = learned('confirm');
      if (known) {
        const hit = buttons.find(function (b) { return labelOf(b) === known; });
        if (hit) return hit;
      }
      const want = String(trashLabel || '').toLowerCase();
      if (want) {
        const same = buttons.filter(function (b) { return labelOf(b).toLowerCase() === want; });
        if (same.length === 1) return same[0];
      }
      const hits = buttons.filter(function (b) { return TRASH_WORDS.test(labelOf(b)); });
      return hits.length === 1 ? hits[0] : null;
    }

    function buttonLabels(dialog) {
      return buttonsIn(dialog).filter(visible).map(labelOf);
    }

    function pressEscape() {
      const target = doc.activeElement && !isPanel(doc.activeElement) ? doc.activeElement : doc.body;
      ['keydown', 'keyup'].forEach(function (type) {
        target.dispatchEvent(new win.KeyboardEvent(type, {
          key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true
        }));
      });
    }

    // In selection mode the leftmost top-bar button is "Clear selection".
    function clearSelection(useEscape) {
      if (!useEscape) {
        const buttons = topButtons().sort(function (a, b) {
          return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
        });
        if (buttons.length) {
          buttons[0].click();
          return;
        }
      }
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
      account: account,
      modalOpen: modalOpen,
      tiles: tiles,
      anyPresent: anyPresent,
      click: click,
      scrollToTop: scrollToTop,
      scrollDown: scrollDown,
      findTrashButton: findTrashButton,
      inSelectionMode: inSelectionMode,
      selectionCount: selectionCount,
      dialogs: dialogs,
      isOpen: isOpen,
      findConfirmButton: findConfirmButton,
      buttonLabels: buttonLabels,
      labelOf: labelOf,
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
      color: '#e8eaed', textAlign: 'left'
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
    let pendingTeach = null;
    let teachText = '';
    let progressText = '';
    const logLines = [];
    let logEl = null;
    let progressEl = null;

    const panel = h(doc, 'div', { id: PANEL_ID, style: STYLE.panel });
    const pill = h(doc, 'button', { type: 'button', style: STYLE.pill, text: 'Photos Remover' });
    const card = h(doc, 'div', { style: STYLE.card, role: 'region', 'aria-label': 'Free Photos Remover' });
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
      if (win.console && win.console.log) win.console.log('[Free Photos Remover] ' + line);
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

    function teach(kind, ctx) {
      return new Promise(function (resolve, reject) {
        teachText = kind === 'trash'
          ? 'I cannot find the trash button in this language. Click the trash button in the top bar of Google Photos once. I will remember it.'
          : 'I cannot find the confirm button. Click the button in the Google dialog that moves the photos to the trash. I will remember it.';
        render();
        function onClick(event) {
          const target = event.target && event.target.closest ? event.target.closest('button, [role="button"]') : null;
          if (!target || panel.contains(target)) return;
          if (kind === 'confirm' && ctx && ctx.dialog && !ctx.dialog.contains(target)) return;
          doc.removeEventListener('click', onClick, true);
          pendingTeach = null;
          teachText = '';
          const label = adapter.labelOf(target);
          log('Learned the ' + kind + ' button: "' + label + '".');
          render();
          resolve(label);
        }
        doc.addEventListener('click', onClick, true);
        pendingTeach = function () {
          doc.removeEventListener('click', onClick, true);
          pendingTeach = null;
          teachText = '';
          reject(new RunError('stopped'));
        };
      });
    }

    function start() {
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
      const limit = parseLimit(limitValue);
      log('Started: ' + (limit === Infinity ? 'all photos' : limit + ' photos') + ' in the ' + where() + '.');
      runner.run(limit).then(function (res) {
        result = { ok: true, trashed: res.trashed, reason: res.reason };
        view = 'done';
        render();
      }, function (err) {
        const code = err && err.code ? err.code : 'unknown';
        result = { ok: code === 'stopped', trashed: err && err.trashed ? err.trashed : 0, reason: code, message: err && err.message };
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
        const input = h(doc, 'input', {
          type: 'number', min: '1', step: '1', placeholder: 'all', inputmode: 'numeric',
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
              if (parseLimit(limitValue) === null) { inputError = 'Enter a whole number, or leave it empty for all.'; render(); return; }
              if (!adapter.page().ok) { result = { ok: false, reason: 'unsupported-page', message: MESSAGES['unsupported-page'] }; view = 'error'; render(); return; }
              if (adapter.modalOpen()) { result = { ok: false, reason: 'close-popup', message: MESSAGES['close-popup'] }; view = 'error'; render(); return; }
              inputError = '';
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
          h(doc, 'p', { style: STYLE.message, text: 'Move ' + what + ' from the ' + where() + ' of ' + (email || 'this account') + ' to the trash?' }),
          h(doc, 'p', { style: STYLE.hint, text: 'You can restore them from the trash for 60 days. Keep this tab open while it runs.' }),
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
        if (result && result.reason === 'empty') text += ' Nothing is left in your ' + where() + '.';
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

    function render() {
      const collapsed = store.get('collapsed') === '1' && view !== 'running' && view !== 'confirm';
      pill.style.display = collapsed ? 'inline-block' : 'none';
      card.style.display = collapsed ? 'none' : 'block';
      if (collapsed) return;
      const header = h(doc, 'div', { style: STYLE.header }, [
        h(doc, 'span', { style: STYLE.title, text: 'Free Photos Remover' }),
        view === 'running' || view === 'confirm'
          ? h(doc, 'span', { text: '' })
          : button('Hide', STYLE.link, function () { setCollapsed(true); })
      ]);
      card.replaceChildren.apply(card, [header].concat(body()));
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }

    render();
    // Google Photos changes pages without reloading. Keep the account and
    // page lines current while idle, but never while someone is typing.
    win.setInterval(function () {
      if (view !== 'idle') return;
      if (doc.activeElement && panel.contains(doc.activeElement)) return;
      if (store.get('collapsed') === '1') return;
      render();
    }, 2000);
    return { panel: panel, adapter: adapter };
  }

  const api = {
    VERSION: VERSION,
    TRASH_WORDS: TRASH_WORDS,
    MESSAGES: MESSAGES,
    RunError: RunError,
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
  root.FreePhotosRemover = api;
  if (root.document && !root.FPR_NO_AUTOMOUNT) {
    const mount = function () { mountPanel(root.document, root); };
    if (root.document.body) mount();
    else root.document.addEventListener('DOMContentLoaded', mount);
  }
})(typeof window !== 'undefined' ? window : globalThis);
