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
- Every click on a Google Photos element goes through `click()` in the page adapter. It refuses off the Library and the Archive and refuses any label that `forbidden()` matches. Keep both guards, and never click around it.
- `forbidden()` blocks words for deleting for good, and emptying words only next to a trash word, because "Clear selection" uses an emptying word in some languages. Dialog text goes through it too.
- In the confirm dialog, accept only Google's accept code when the dialog also has Google's cancel code, a label learned from the user, or the exact label of the trash button. Never match the confirm button by trash words: "Empty trash" contains them.
- A dialog counts only after it has been the only new one for `dialogSettle` ms. After a trash button learned in the same batch, the user confirms too.
- Fail closed. When the count, the page or the account cannot be confirmed, stop without clicking.
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
