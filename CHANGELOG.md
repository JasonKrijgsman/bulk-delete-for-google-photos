# Changelog

## 1.1.0 (2026-09-25)

- The extension has a toolbar button. It opens Google Photos in a new tab. On a Google Photos tab it shows the panel instead, also after you hid it.
- The tab title shows the progress, such as "[Bulk Delete: 1,250 moved]", so you can follow a run from the tab strip.
- While it runs, the panel shows the speed. When it ends, the panel shows how long the run took. Counts use a thousands separator, such as 2,903.
- New: a userscript for Firefox and any other browser with a userscript manager, such as Violentmonkey or Tampermonkey. It is `remover.js` with a userscript header, and the manager can keep it up to date.
- Download links that always point to the newest release: `releases/latest/download/bulk-delete-for-google-photos.zip` for the extension and `releases/latest/download/bulk-delete-for-google-photos.user.js` for the userscript. The ZIP with the version in its name stays, and each ZIP has a SHA-256 file.
- Bug reports and feature requests use forms. The bug form asks for the browser, how you installed it, the interface language, what the panel said and its log lines.
- The README has a quick start, an FAQ and more help for when it stops.
- The panel and the README now say photos stay in the trash for 30 days. Google cut that from 60 days on 4 September 2026.

## 1.0.0 (2026-09-25)

- First release.
- Moves photos from the Library or the Archive to the trash in batches of up to 250, either a set number or all of them.
- Shows the signed-in account and asks before it starts. Stops when the page or the account changes during a run.
- Clicks nothing off the Library and the Archive. Never clicks a button, and never confirms a dialog, that speaks of emptying the trash or deleting for good.
- Reads the count Google shows before each batch, and stops if it cannot read it or if it is higher than planned.
- Confirms only a dialog that stays the only new one and carries both of Google's dialog codes. Checks that the selection disappears and that the photos are really gone.
- Finds Google's confirm button by its dialog code. Learns the trash button from one click when it does not know the interface language, and then lets the user confirm that batch too.
- Pauses while its tab is hidden.
- Tested live on the Dutch interface: it emptied a Library of 2,903 photos in four minutes and an Archive of 86, with no teaching clicks.
