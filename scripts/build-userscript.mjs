// Writes userscript/bulk-delete-for-google-photos.user.js: a userscript
// header, then extension/remover.js unchanged. The name, version,
// description, match and run time come from extension/manifest.json, so the
// userscript runs where and when the extension does.
//
// Run it after every change to remover.js or the manifest:
//
//   npm run build:userscript
//
// test/userscript.test.js fails when the committed file differs from what this
// script writes. CI builds it again for each release.

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_URL = 'https://github.com/JasonKrijgsman/bulk-delete-for-google-photos';
export const FILE_NAME = 'bulk-delete-for-google-photos.user.js';
export const OUTPUT = join(ROOT, 'userscript', FILE_NAME);

// The release always carries the userscript under this name, so this link
// always points to the newest version. Userscript managers check it for
// updates.
export const LATEST_URL = REPO_URL + '/releases/latest/download/' + FILE_NAME;
export const ICON_URL =
  'https://raw.githubusercontent.com/JasonKrijgsman/bulk-delete-for-google-photos/main/extension/icons/icon48.png';

// The header fields, in order. @grant none asks the manager for no extra
// rights, such as its cross-site requests or its storage: the script gets the
// page and nothing more, like the extension's content script. @noframes keeps
// it out of frames inside the page, where the content script does not run
// either.
export function buildHeader(manifest) {
  const content = manifest.content_scripts[0];
  const fields = [['name', manifest.name], ['namespace', REPO_URL], ['version', manifest.version],
    ['description', manifest.description]];
  content.matches.forEach((match) => fields.push(['match', match]));
  fields.push(
    ['grant', 'none'],
    ['run-at', content.run_at.replace('_', '-')],
    ['noframes', ''],
    ['license', 'MIT'],
    ['homepageURL', REPO_URL],
    ['supportURL', REPO_URL + '/issues'],
    ['icon', ICON_URL],
    ['downloadURL', LATEST_URL],
    ['updateURL', LATEST_URL]
  );
  const width = Math.max(...fields.map(([key]) => key.length)) + 2;
  const lines = fields.map(([key, value]) => ('// @' + key.padEnd(width) + value).trimEnd());
  return ['// ==UserScript==', ...lines, '// ==/UserScript==', ''].join('\n');
}

export function buildUserscript(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8'));
  const source = readFileSync(join(root, 'extension', 'remover.js'), 'utf8');
  return buildHeader(manifest) + '\n' + source;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch (e) {
    return false;
  }
}

if (isMain()) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, buildUserscript());
  console.log('Wrote ' + relative(process.cwd(), OUTPUT));
}
