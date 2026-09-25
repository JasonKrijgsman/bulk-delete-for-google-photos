# Bulk Delete for Google Photos

Moves the photos in your Google Photos library to the trash in bulk. Free, with no daily limit.

Google Photos has no "delete all" button. Paid extensions sell one, and their free versions stop after a few hundred photos a day. This one is free and open source, and it keeps going until it is done.

## What it does

- It ticks the photos in your Library or Archive, from the top down, the same way you would.
- It clicks the Google Photos trash button and confirms, in batches of up to 250 photos.
- It stops at the number you set, or when nothing is left.

## What it never does

- It never empties the trash. Your photos stay in the trash for 60 days, and you can restore them from there.
- It clicks nothing unless the page is your Library or your Archive. It stops when the page or the signed-in account changes.
- It never clicks a button, and never confirms a dialog, that speaks of emptying the trash or deleting for good. It recognises those words in about 30 languages.
- It sends nothing anywhere and makes no network requests. It only runs on photos.google.com; Chrome lists that site as the one it can read and change.

## Install

It works in Chrome, Edge, Brave and other Chromium browsers. It is not in the Chrome Web Store, so you load it yourself:

1. Download the ZIP from the [latest release](https://github.com/JasonKrijgsman/bulk-delete-for-google-photos/releases/latest) and unzip it. Or clone this repository.
2. Open `chrome://extensions` (`edge://extensions` in Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder. In a clone, pick the `extension` folder.

## Use

1. Open [photos.google.com](https://photos.google.com) and sign in to the account you want to clean up.
2. Close any Google pop-up, such as a storage warning.
3. Click **Bulk Delete** at the bottom right.
4. Check the account in the panel. The photos come from that account.
5. Enter how many photos to move, or leave the box empty to move all of them.
6. Click **Move to trash**, then **Yes, move them**.
7. Keep the tab open and in front until the panel says it is done. It pauses while the tab is hidden, because Chrome hardly draws a hidden tab.
8. To delete the photos for good, open the trash in Google Photos and empty it yourself.

It moves about 750 photos a minute. Its first real run emptied a Library of 2,903 photos in four minutes, then an Archive of 86.

**Stop** ends the run safely. Before a batch reaches the trash button, it clears the selection. Once Google is moving a batch, it lets that batch finish and counts it.

Google's confirm dialog says the photos will be removed from your Google account, your backed-up devices and the places you shared them. That is how Google words a move to the trash. The photos go to the trash, and Google says so at the bottom of the page.

To clean up archived photos, open **Archive** first and do the same.

## Without installing

You can also paste `extension/remover.js` into the browser console on photos.google.com (press F12, then open Console). Chrome asks you to type `allow pasting` first. Read the script before you paste it. Never paste code you do not trust into a console.

## Languages

It was tested on the Dutch interface of Google Photos.

- It finds the trash button by its label. It knows the word for "trash" in more than 30 languages.
- It finds the confirm button by a code Google puts on the buttons of its dialogs. On the Dutch interface that code is not text, so it is likely the same in other languages; that has not been checked.
- If it cannot find a button in your language, it asks you to click that button once. It remembers your click after the first batch works. **Forget learned buttons** in the panel clears what it learned.

## If it stops

| Message | What to do |
|---|---|
| Close the Google Photos pop-up first | Close the pop-up, then start again. |
| Could not read how many photos Google selected | Nothing from that batch was moved. Check that no photos are still selected. Open an issue and name your interface language. |
| Google selected more photos than planned | Nothing from that batch was moved. Start again. |
| The page or the account changed | It stopped on purpose. Go back to the Library or Archive and start again. |
| More than one Google dialog opened | Nothing was confirmed. Close the dialogs, then start again. |
| The Google dialog speaks of emptying the trash or deleting for good | Nothing was confirmed. Open an issue and name your interface language. |
| Google did not remove all photos from the last batch | Google may be slowing you down. Wait a while, then start again. |

Google changes its pages from time to time. If it stops working, [open an issue](https://github.com/JasonKrijgsman/bulk-delete-for-google-photos/issues).

## How it works

`extension/remover.js` is the whole tool. It has three parts:

- **The runner** holds the procedure: select a batch, check the count Google shows, click the trash button, confirm, then check that the photos are gone.
- **The page adapter** finds things by the structure of the page, not by the class names Google generates. A photo checkbox is a checkbox that sits next to exactly one link to a photo. Every click on a Google Photos element goes through one function, which refuses off the Library and the Archive.
- **The panel** is the small window at the bottom right.

It checks its own work:

- It only clicks on the page and in the account you confirmed. If either changes, it stops.
- Before each batch it reads the count Google shows. If it cannot read the count, or the count is higher than planned, it clears the selection and stops.
- It only confirms a dialog that stays the only new one for half a second, and that has both Google's confirm and cancel codes.
- After confirming, the selection must disappear. Then photos must show at the top of the grid again, and none of them may be from that batch.
- It never clicks the select-all box of a day, because one click there can select hundreds of photos.

## Development

There is no build step. The `extension` folder is the product.

```
npm test
```

This runs the unit tests and, when Chrome is installed, a headless run against `test/fixture/photos.html`. That page copies the structure of the Google Photos library page. Its scenarios include a decoy trash button outside the top bar, a right-to-left layout, an "Empty trash" button, dialogs that would empty the trash or delete for good, a pop-up next to the confirm dialog and a number badge in the top bar. Set `CHROME_PATH` when Chrome is not found.

To draw the icons again: `python scripts/make-icons.py`.

## Not affiliated with Google

Google Photos is a trademark of Google LLC. This project is not affiliated with, sponsored by or endorsed by Google.

## Licence

[MIT](LICENSE)
