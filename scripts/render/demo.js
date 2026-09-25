/*
 * Drives the made-up photo library in demo.html, for scripts/render-images.mjs.
 *
 * URL parameters:
 *   state   idle, confirm, running or done (default idle)
 *   only    "panel": when the state is reached, hide everything but the panel
 *   photos  how many photos the library holds (default 2903, like the first real run)
 *   ticked  for running: how many photos of the fifth batch are ticked in the
 *           picture (default 131; the status lists where each scroll round began)
 *
 * The grid behaves like test/fixture/fake-photos.js: each photo checkbox sits
 * next to exactly one ./photo/ link, day headers carry their own checkbox, only
 * rows near the visible part are in the DOM, a selection bar with "N selected"
 * and a trash button replaces the top bar, and a dialog with Google's two action
 * codes asks before anything moves. Google's delays below are set so a full run
 * of 2,903 photos takes about four minutes, like the first real run.
 *
 * Nothing here talks to Google or to any server. When the requested state is
 * reached, the page stops every timer, so the picture shows that exact moment,
 * and it writes a summary into <pre id="status"> for the render script.
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const STATE = params.get('state') || 'idle';
  const PANEL_ONLY = params.get('only') === 'panel';
  const TOTAL = Math.max(0, parseInt(params.get('photos') || '2903', 10) || 0);
  const FREEZE = { batches: 4, ticked: Math.max(1, parseInt(params.get('ticked') || '131', 10) || 131) };

  // Google's side, in milliseconds: the confirm dialog, dropping the selection
  // after the confirm click, and removing the photos from the grid.
  const GOOGLE = { dialogDelay: 200, clearDelay: 400, moveDelay: 2000 };

  // One switch stops every timer on the page, the panel's too, so the picture
  // shows one exact moment. remover.js looks up setTimeout when it sleeps.
  const realSetTimeout = window.setTimeout.bind(window);
  let frozen = false;
  window.setTimeout = function (fn, ms) {
    const args = Array.prototype.slice.call(arguments, 2);
    return realSetTimeout(function () { if (!frozen) fn.apply(null, args); }, ms);
  };

  // ---- Made-up photos: gradients from tiles.js, never real pictures. ----

  const rng = window.DemoTiles.mulberry32(20260925);
  const nextTile = window.DemoTiles.create(7);
  let photos = [];
  (function makePhotos() {
    let day = 0;
    while (photos.length < TOTAL) {
      const count = 3 + Math.floor(rng() * 18);
      for (let i = 0; i < count && photos.length < TOTAL; i++) {
        photos.push({ id: 'demo' + String(photos.length).padStart(5, '0'), day: day, bg: nextTile() });
      }
      day += 1 + (rng() < 0.45 ? Math.floor(rng() * 5) : 0);
    }
  })();

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TODAY = Date.UTC(2026, 8, 25);
  function dayLabel(day) {
    if (day === 0) return 'Today';
    if (day === 1) return 'Yesterday';
    const d = new Date(TODAY - day * 86400000);
    const year = d.getUTCFullYear() === 2026 ? '' : ' ' + d.getUTCFullYear();
    return WEEKDAYS[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + year;
  }

  // ---- Small DOM helpers. ----

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    [].concat(children === undefined ? [] : children).forEach(function (child) {
      node.append(child);
    });
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function circle(cx, cy, r) {
    return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' +
      (-2 * r) + ' 0';
  }
  const ICONS = {
    menu: 'M4 7h16M4 12h16M4 17h16',
    search: circle(10.5, 10.5, 6) + 'M15 15l5 5',
    upload: 'M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14',
    help: circle(12, 12, 9) + 'M9.7 9.4a2.4 2.4 0 1 1 3.3 2.3c-.7.3-1 .8-1 1.5v.3M12 17v.2',
    tune: 'M4 7h9M17 7h3M4 17h3M11 17h9' + circle(15, 7, 2) + circle(9, 17, 2),
    close: 'M6 6l12 12M18 6L6 18',
    share: circle(18, 5.5, 2.5) + circle(6, 12, 2.5) + circle(18, 18.5, 2.5) + 'M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1',
    plus: 'M12 5v14M5 12h14',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7' +
      'M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7',
    more: circle(12, 5.5, 0.6) + circle(12, 12, 0.6) + circle(12, 18.5, 0.6)
  };
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', name === 'more' ? '2.6' : '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }
  function brandMark() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    [
      ['rect', { x: '3', y: '5', width: '26', height: '22', rx: '6', fill: '#e3e9f4' }],
      ['circle', { cx: '21.5', cy: '12', r: '3.2', fill: '#f59e0b' }],
      ['path', { d: 'M5 24.5l7.5-8 5 5 3.5-3.5 6 6.5z', fill: '#64748b' }]
    ].forEach(function (shape) {
      const node = document.createElementNS(SVG_NS, shape[0]);
      Object.keys(shape[1]).forEach(function (key) { node.setAttribute(key, shape[1][key]); });
      svg.appendChild(node);
    });
    return svg;
  }

  function iconButton(name, label, onClick) {
    const button = el('button', { type: 'button', class: 'icon-btn', 'aria-label': label }, icon(name));
    if (onClick) button.addEventListener('click', onClick);
    return button;
  }

  // ---- The page: top bar, grid and dialog. ----

  const topbar = document.getElementById('topbar');
  const main = document.getElementById('main');
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const selected = new Set();
  let items = [];
  let height = 0;
  let renderedAt = -1;
  let batchesDone = 0;
  let dialog = null;
  let finished = false;
  // Where each scroll round of the fifth batch began, counted in ticked
  // photos. It helps to pick a `ticked` value that shows both kinds of tile.
  const roundStarts = [];
  let lastTickScroll = -1;

  function renderTop() {
    const selecting = selected.size > 0;
    document.body.classList.toggle('selecting', selecting);
    topbar.classList.toggle('selecting', selecting);
    if (selecting) {
      topbar.replaceChildren(
        iconButton('close', 'Clear selection', clearSelection),
        el('div', { class: 'count' }, selected.size + ' selected'),
        el('div', { class: 'grow' }),
        iconButton('share', 'Share'),
        iconButton('plus', 'Add to album'),
        iconButton('download', 'Download'),
        iconButton('trash', 'Move to trash', onTrash),
        iconButton('more', 'More options')
      );
      return;
    }
    const upload = el('button', { type: 'button', class: 'text-btn', 'aria-label': 'Upload' }, [icon('upload'), 'Upload']);
    const avatar = el('button', { type: 'button', class: 'avatar', 'aria-label': 'Google Account: You (you@example.com)' }, 'Y');
    topbar.replaceChildren(
      iconButton('menu', 'Main menu'),
      el('div', { class: 'brand' }, [brandMark(), el('span', {}, 'Photos')]),
      el('div', { class: 'search' }, [icon('search'), el('input', { type: 'text', placeholder: 'Search your photos', 'aria-label': 'Search' })]),
      el('div', { class: 'grow' }),
      upload,
      iconButton('help', 'Help'),
      iconButton('tune', 'Settings'),
      avatar
    );
  }

  function layout() {
    const width = main.clientWidth - 20;
    const cols = Math.max(3, Math.round(width / 136));
    const gap = 4;
    const size = Math.floor((width - gap * (cols - 1)) / cols);
    items = [];
    let y = 0;
    let current = -1;
    let col = 0;
    photos.forEach(function (photo) {
      if (photo.day !== current) {
        if (col) { y += size + gap; col = 0; }
        if (current !== -1) y += 6;
        current = photo.day;
        items.push({ kind: 'day', day: photo.day, y: y });
        y += 50;
      }
      items.push({ kind: 'photo', photo: photo, x: col * (size + gap), y: y, size: size });
      col++;
      if (col === cols) { col = 0; y += size + gap; }
    });
    if (col) y += size + gap;
    height = y + 24;
  }

  function dayNode(item) {
    const node = el('div', { class: 'day' }, [
      el('div', { role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'Select all photos from ' + dayLabel(item.day), tabindex: '0' }),
      el('span', {}, dayLabel(item.day))
    ]);
    node.style.top = item.y + 'px';
    return node;
  }

  function tileNode(item) {
    const photo = item.photo;
    const on = selected.has(photo.id);
    const tile = el('div', { class: on ? 'tile sel' : 'tile' });
    tile.style.cssText = 'left:' + item.x + 'px;top:' + item.y + 'px;width:' + item.size + 'px;height:' + item.size + 'px';
    const img = el('div', { class: 'img' });
    img.style.background = photo.bg;
    const link = el('a', { href: './photo/' + photo.id, 'aria-label': 'Photo ' + photo.id });
    link.addEventListener('click', function (event) { event.preventDefault(); });
    const box = el('div', { role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'aria-label': 'Select photo', tabindex: '0' });
    box.addEventListener('click', function () { toggle(photo.id, tile, box); });
    tile.append(img, link, box);
    return tile;
  }

  function renderGrid(force) {
    if (!force && main.scrollTop === renderedAt) return;
    renderedAt = main.scrollTop;
    grid.style.height = height + 'px';
    const top = main.scrollTop - 100;
    const bottom = main.scrollTop + main.clientHeight + 100;
    const nodes = [];
    items.forEach(function (item) {
      const size = item.kind === 'day' ? 50 : item.size;
      if (item.y + size < top || item.y > bottom) return;
      nodes.push(item.kind === 'day' ? dayNode(item) : tileNode(item));
    });
    grid.replaceChildren.apply(grid, nodes);
    empty.classList.toggle('show', photos.length === 0);
  }

  function toggle(id, tile, box) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    const on = selected.has(id);
    tile.classList.toggle('sel', on);
    box.setAttribute('aria-checked', on ? 'true' : 'false');
    renderTop();
    if (batchesDone === FREEZE.batches && main.scrollTop !== lastTickScroll) {
      roundStarts.push(selected.size);
      lastTickScroll = main.scrollTop;
    }
    if (STATE === 'running' && batchesDone === FREEZE.batches && selected.size === FREEZE.ticked) finish();
  }

  function clearSelection() {
    selected.clear();
    renderTop();
    renderGrid(true);
  }

  function onTrash() {
    if (!dialog) setTimeout(openDialog, GOOGLE.dialogDelay);
  }

  function openDialog() {
    const scrim = el('div', { class: 'scrim' });
    const cancel = el('button', { type: 'button', 'data-mdc-dialog-action': 'IbE0S' }, 'Cancel');
    const ok = el('button', { type: 'button', 'data-mdc-dialog-action': 'EBS5u' }, 'Move to trash');
    cancel.addEventListener('click', closeDialog);
    ok.addEventListener('click', confirmMove);
    const box = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', class: 'dlg' }, [
      el('h2', { id: 'dialog-title' }, 'Move ' + selected.size + ' items to the trash?'),
      el('p', {}, 'You can restore them from the trash for 30 days.'),
      el('div', { class: 'actions' }, [cancel, ok])
    ]);
    document.body.append(scrim, box);
    dialog = [scrim, box];
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.forEach(function (node) { node.remove(); });
    dialog = null;
  }

  function confirmMove() {
    const moving = new Set(selected);
    closeDialog();
    setTimeout(function () {
      selected.clear();
      renderTop();
      renderGrid(true);
    }, GOOGLE.clearDelay);
    setTimeout(function () {
      photos = photos.filter(function (photo) { return !moving.has(photo.id); });
      batchesDone++;
      layout();
      renderGrid(true);
    }, GOOGLE.moveDelay);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (dialog) closeDialog();
    else if (selected.size) clearSelection();
  });
  main.addEventListener('scroll', function () { renderGrid(false); });
  setInterval(function () { renderGrid(false); }, 30);

  renderTop();
  layout();
  renderGrid(true);

  // ---- The real panel, driven by clicks on its own buttons. ----

  const mounted = window.BulkDeleteForGooglePhotos.mountPanel(document, window, { path: function () { return '/'; } });
  const panel = mounted.panel;

  function panelButton(text) {
    return Array.prototype.find.call(panel.querySelectorAll('button'), function (b) {
      return b.textContent.trim() === text;
    }) || null;
  }

  function finish() {
    if (finished) return;
    finished = true;
    frozen = true;
    if (PANEL_ONLY) document.documentElement.classList.add('panel-only');
    const card = panel.querySelector('[role="region"]');
    const r = card.getBoundingClientRect();
    const status = {
      state: STATE,
      text: card.innerText,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      photosLeft: photos.length,
      selected: selected.size,
      batches: batchesDone,
      roundStarts: roundStarts
    };
    document.getElementById('status').textContent = JSON.stringify(status);
    if (window.parent !== window) window.parent.postMessage({ source: 'bulk-delete-demo', status: status }, '*');
  }

  // A run that ends, or stops with an error, shows the Back button.
  function finishWhenBack() {
    const observer = new MutationObserver(function () {
      if (panelButton('Back')) {
        observer.disconnect();
        finish();
      }
    });
    observer.observe(panel, { childList: true, subtree: true });
  }

  function drive() {
    if (STATE === 'idle') { finish(); return; }
    panelButton('Move to trash').click();
    if (STATE === 'confirm') { finish(); return; }
    finishWhenBack();
    panelButton('Yes, move them').click();
  }

  setTimeout(drive, 100);
})();
