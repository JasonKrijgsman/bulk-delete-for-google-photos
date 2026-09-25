# AGENTS.md

Context for any agent that works in this repository.

## What this is

A browser extension, also usable as a userscript or a console script, that moves photos from a Google Photos Library or Archive to the trash in bulk. One file does the work: `extension/remover.js`.

## Rules

- Only ever move photos to the trash. Never empty the trash and never delete anything permanently.
- No network requests, telemetry, accounts or payments. No extension permissions beyond the one content script match. The userscript keeps `@grant none` and loads no other code: no `@require`, `@resource` or `@connect`.
- Find Google's elements by structure, position and labels learned from the user. Never depend on the class names Google generates; they change without notice.
- Never build HTML from strings. photos.google.com enforces Trusted Types. A test checks the source for these calls.
- Click buttons only in the top bar or in the confirm dialog. Never click the select-all checkbox of a day.
- Every click on a Google Photos element goes through `click()` in the page adapter. It refuses off the Library and the Archive and refuses any label that `forbidden()` matches. Keep both guards, and never click around it.
- `forbidden()` blocks words for deleting for good, and emptying words only next to a trash word, because "Clear selection" uses an emptying word in some languages. Dialog text goes through it too.
- In the confirm dialog, accept only Google's accept code when the dialog also has Google's cancel code, a label learned from the user, or the exact label of the trash button. Never match the confirm button by trash words: "Empty trash" contains them.
- A dialog counts only after it has been the only new one for `dialogSettle` ms. After a trash button learned in the same batch, the user confirms too.
- Fail closed. When the count, the page or the account cannot be confirmed, stop without clicking.
- Keep the version equal in `extension/remover.js`, `extension/manifest.json` and `package.json`. A test checks it.
- The userscript is generated from `extension/remover.js` and the manifest. Never edit it by hand. After a change to either, run `npm run build:userscript` and commit the result. A test fails when it is out of date.
- Record every change users can notice in `CHANGELOG.md`.
- Write docs in short, plain sentences. No em dashes or en dashes.
- Google changes its help pages too. The trash period went from 60 to 30 days in September 2026. Check Google's own help before you state a number about the trash.

## Layout

- `extension/`: the product. `manifest.json`, `remover.js`, `background.js` (the toolbar button) and the icons.
- `userscript/bulk-delete-for-google-photos.user.js`: the userscript. It is `remover.js` with a userscript header. Generated.
- `scripts/build-userscript.mjs`: writes the userscript. Run it with `npm run build:userscript`.
- `scripts/make-icons.py`: draws the icons, with no dependencies.
- `scripts/render/`: a made-up photo library with the real panel, used only to render the pictures in `docs/images/` in headless Chrome.
- `test/runner.test.js`: unit tests with a fake library.
- `test/userscript.test.js`: fails when the committed userscript differs from what the build script writes, or when its header is wrong.
- `test/e2e.test.js` and `test/fixture/`: a headless Chrome run against a page that copies the structure of the real library page.
- `docs/`: the website, served by GitHub Pages at https://jasonkrijgsman.github.io/bulk-delete-for-google-photos/. The README uses its screenshots in `docs/images/`.
- `docs/13eeca9cd22f8caf762839933739d561.txt`: the IndexNow key. It proves to Bing and other IndexNow engines that we own the site. It is public on purpose. Keep it. After a change to the website, submit the changed URLs to `https://api.indexnow.org/indexnow` with this key and this file as the `keyLocation`.
- Crawlers read `robots.txt` only at the root of a host, so they never see `docs/robots.txt`. Submit the sitemap by hand in Google Search Console and Bing Webmaster Tools.
- `.github/workflows/ci.yml`: tests on every push and pull request, and the release on a tag.
- `.github/ISSUE_TEMPLATE/`: the bug report and feature request forms, and a link to the website.

## Tests

Run `npm test`. The headless test needs Chrome; set `CHROME_PATH` when it is not in a standard place. A change to how the adapter finds elements also needs a check on the real site, because the fixture only copies what the site looked like on the date in `test/fixture/fake-photos.js`.

## Release

1. Set the new version in `extension/manifest.json`, `extension/remover.js` and `package.json`.
2. Run `npm run build:userscript`, then `npm test`.
3. Put the release date next to the version in `CHANGELOG.md`.
4. Commit, then push a tag `vX.Y.Z` that matches the manifest version.

CI runs the tests, checks that the tag matches the manifest version, builds the userscript again and publishes a GitHub release. The release notes explain how to install both ways and carry the version's section of `CHANGELOG.md`. The release has these files:

- `bulk-delete-for-google-photos.zip`: the `extension` folder.
- `bulk-delete-for-google-photos-vX.Y.Z.zip`: the same files, with the version in the name.
- A `.sha256` file for each ZIP.
- `bulk-delete-for-google-photos.user.js`: the userscript.

The README, the website and the userscript's `@downloadURL` and `@updateURL` link to `releases/latest/download/` with the names that have no version in them. Never rename those files.
