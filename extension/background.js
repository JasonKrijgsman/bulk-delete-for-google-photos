/*
 * Bulk Delete for Google Photos: the toolbar button.
 *
 * On a Google Photos tab it opens the panel. Anywhere else it opens Google
 * Photos in a new tab. It needs no permissions: messaging its own content
 * script and opening a tab are allowed without them.
 */
'use strict';

const PHOTOS_URL = 'https://photos.google.com/';

async function onToolbarClick(tab, api) {
  try {
    // Only the content script on a Google Photos tab answers this message.
    await api.tabs.sendMessage(tab.id, { type: 'bulk-delete:show' });
  } catch (e) {
    await api.tabs.create({ url: PHOTOS_URL });
  }
}

if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(function (tab) { onToolbarClick(tab, chrome); });
}

if (typeof module === 'object' && module && module.exports) {
  module.exports = { onToolbarClick: onToolbarClick, PHOTOS_URL: PHOTOS_URL };
}
