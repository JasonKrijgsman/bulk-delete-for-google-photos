# AGENTS.md

Context for any agent that works in this repository.

## What this is

A browser extension, also usable as a console script, that moves photos from a Google Photos Library or Archive to the trash in bulk. One file does the work: `extension/remover.js`.

## Rules

- Only ever move photos to the trash. Never empty the trash and never delete anything permanently.
- No network requests, telemetry, accounts or payments. No extension permissions beyond the one content script match.
- Find Google's elements by structure, position and labels learned from the user. Never depend on the class names Google generates; they change without notice.
- Never build HTML from strings. photos.google.com enforces Trusted Types. A test checks the source for these calls.
- Click buttons only in the top bar or in the confirm dialog. Never click the select-all checkbox of a day.
- Keep the version equal in `extension/remover.js`, `extension/manifest.json` and `package.json`. A test checks it.
- Record every change users can notice in `CHANGELOG.md`.
- Write docs in short, plain sentences. No em dashes or en dashes.

## Layout

- `extension/`: the product. `manifest.json`, `remover.js` and the icons.
- `test/runner.test.js`: unit tests with a fake library.
- `test/e2e.test.js` and `test/fixture/`: a headless Chrome run against a page that copies the structure of the real library page.
- `scripts/make-icons.py`: draws the icons, with no dependencies.

## Tests

Run `npm test`. The headless test needs Chrome; set `CHROME_PATH` when it is not in a standard place. A change to how the adapter finds elements also needs a check on the real site, because the fixture only copies what the site looked like on the date in `test/fixture/fake-photos.js`.

## Release

Push a tag `vX.Y.Z` that matches the manifest version. CI runs the tests, zips `extension/` and attaches the ZIP and its SHA-256 to a GitHub release.
