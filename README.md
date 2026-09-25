# Free Photos Remover for Google Photos

Moves the photos in your Google Photos library to the trash in bulk. Free, with no daily limit.

Google Photos has no "delete all" button. Paid extensions sell one, and their free versions stop after a few hundred photos a day. This one is free and open source, and it keeps going until it is done.

## What it does

- It ticks the photos in your Library or Archive, from the top down, the same way you would.
- It clicks the Google Photos trash button and confirms, in batches of up to 250 photos.
- It stops at the number you set, or when nothing is left.

## What it never does

- It never empties the trash. Your photos stay in the trash for 60 days, and you can restore them from there.
- It sends nothing anywhere. It makes no network requests and asks for no browser permissions.
- It never touches albums, shared items, the Locked Folder or the trash page.

## Install

It works in Chrome, Edge, Brave and other Chromium browsers.

1. Download the ZIP from the [latest release](https://github.com/JasonKrijgsman/free-photos-remover/releases/latest) and unzip it. Or clone this repository.
2. Open `chrome://extensions` (`edge://extensions` in Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped folder. In a clone, pick the `extension` folder.

## Use

1. Open [photos.google.com](https://photos.google.com) and sign in to the account you want to clean up.
2. Close any Google pop-up, such as a storage warning.
3. Click **Photos Remover** at the bottom right.
4. Check the account in the panel. The photos come from that account.
5. Enter how many photos to move, or leave the box empty to move all of them.
6. Click **Move to trash**, then **Yes, move them**.
7. Keep the tab open until the panel says it is done. **Stop** ends the run after the current step.
8. To delete the photos for good, open the trash in Google Photos and empty it yourself.

To clean up archived photos, open **Archive** first and do the same.

## Without installing

You can also paste `extension/remover.js` into the browser console on photos.google.com (press F12, then open Console). Chrome asks you to type `allow pasting` first. Read the script before you paste it. Never paste code you do not trust into a console.

## Languages

The panel finds the trash button by its label. It knows the word for "trash" in more than 30 languages. It was tested on the Dutch interface of Google Photos. If it cannot find the button in your language, it asks you to click that button once. It remembers your click after the first batch works. **Forget learned buttons** in the panel clears what it learned.

## If it stops

| Message | What to do |
|---|---|
| Close the Google Photos pop-up first | Close the pop-up, then start again. |
| Google selected more photos than planned | Nothing from that batch was moved. Start again. |
| Google did not remove all photos from the last batch | Google may be slowing you down. Wait a while, then start again. |
| Could not find the confirm button | Nothing from that batch was moved. Open an issue and name your interface language. |

Google changes its pages from time to time. If the remover stops working, [open an issue](https://github.com/JasonKrijgsman/free-photos-remover/issues).

## How it works

`extension/remover.js` is the whole tool. It has three parts:

- **The runner** holds the procedure: select a batch, check the count Google shows, click the trash button, confirm, then check that the photos are gone.
- **The page adapter** finds things by the structure of the page, not by the class names Google generates. A photo checkbox is a checkbox that sits next to exactly one link to a photo. Buttons are only clicked in the top bar or in the confirm dialog.
- **The panel** is the small window at the bottom right.

It checks its own work:

- Before each batch it reads the count Google shows. If Google selected more than planned, it clears the selection and stops.
- After each batch it checks that the first photos of that batch are gone. If they are not, it stops.
- It never clicks the select-all box of a day, because one click there can select hundreds of photos.

## Development

There is no build step. The `extension` folder is the product.

```
npm test
```

This runs the unit tests and, when Chrome is installed, a headless run against `test/fixture/photos.html`. That page copies the structure of the Google Photos library page, including a decoy trash button outside the top bar that must never be clicked. Set `CHROME_PATH` when Chrome is not found.

To draw the icons again: `python scripts/make-icons.py`.

## Not affiliated with Google

Google Photos is a trademark of Google LLC. This project is not affiliated with, sponsored by or endorsed by Google.

## Licence

[MIT](LICENSE)
