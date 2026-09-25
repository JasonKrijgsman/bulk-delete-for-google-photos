# Chrome Web Store listing

Everything needed to submit Bulk Delete for Google Photos to the Chrome Web Store. Copy each field as it stands. The images come from `node scripts/render-images.mjs`.

## Item details

| Field | Value |
|---|---|
| Name | Bulk Delete for Google Photos |
| Summary | Moves the photos in your Google Photos library to the trash in bulk. Free, no daily limit, nothing leaves your browser. |
| Category | Tools |
| Language | English |
| Homepage URL | https://jasonkrijgsman.github.io/bulk-delete-for-google-photos/ |
| Support URL | https://github.com/JasonKrijgsman/bulk-delete-for-google-photos/issues |
| Privacy policy URL | https://jasonkrijgsman.github.io/bulk-delete-for-google-photos/#privacy |
| Price | Free |
| Visibility | Public |
| Regions | All regions |

The store takes the name and the summary from `extension/manifest.json`: `name` and `description`. The summary has 119 characters, within the limit of 132. To change either, change the manifest and upload a new package.

## Description

Paste this as plain text.

```
Google Photos has no button to select or delete all your photos. You can tick one day at a time, which is slow for a big library. Bulk Delete for Google Photos does the ticking for you. It moves the photos in your Library or Archive to the trash, up to 250 at a time, until none are left or until it reaches the number you set.

It is free and open source. There is no paid version, no daily limit and no account.

HOW TO USE IT
1. Open photos.google.com and sign in to the account you want to clean up.
2. Find the panel at the bottom right. It shows the signed-in account.
3. Enter how many photos to move, or leave the box empty to move all of them.
4. Click Move to trash, then Yes, move them.
5. Keep the tab open and in front until the panel says it is done.
6. Check the trash in Google Photos. To delete the photos for good, empty the trash yourself.

On a real account it moved 2,903 photos in four minutes, about 750 a minute.

WHAT IT NEVER DOES
- It never empties the trash. Google keeps your photos there for 30 days, and you can restore them until then.
- It clicks nothing unless the page is your Library or your Archive. It stops when the page or the signed-in account changes.
- It never clicks a button, and never confirms a dialog, that speaks of emptying the trash or deleting for good.
- It sends nothing anywhere. It makes no network requests and collects no data.

GOOD TO KNOW
- When you delete photos in Google Photos, Google also removes them from the phones and tablets that back up to that account, and from the places you shared them. Download copies first with Google Takeout if you want to keep them.
- It was tested live on the Dutch interface of Google Photos. It knows the word for trash in more than 30 languages. If it cannot find a button in your language, it asks you to click that button once.
- It pauses while its tab is hidden.
- The toolbar button shows the panel on Google Photos. Anywhere else it opens Google Photos in a new tab.

Source code, changelog and bug reports: https://github.com/JasonKrijgsman/bulk-delete-for-google-photos

Not affiliated with Google. Google Photos is a trademark of Google LLC.
```

## Images

| Store field | Size | File |
|---|---|---|
| Store icon | 128 x 128 | `extension/icons/icon128.png` |
| Screenshot 1 | 1280 x 800 | `store/screenshot-1.png`: the panel before a run |
| Screenshot 2 | 1280 x 800 | `store/screenshot-2.png`: a run in progress |
| Screenshot 3 | 1280 x 800 | `store/screenshot-3.png`: the finished run |
| Small promo tile | 440 x 280 | `store/promo-small.png` |
| Marquee promo tile | 1400 x 560 | Not made. It is optional. |

The screenshots show a made-up photo library with gradient tiles and the real panel from `extension/remover.js`. They contain no real photos, no real account and no Google logo. The account in them is `you@example.com`.

## Privacy practices tab

**Single purpose**

```
Bulk Delete for Google Photos has one purpose: it moves the photos in the user's Google Photos Library or Archive to the Google Photos trash in bulk. It clicks the same checkboxes and buttons the user would click.
```

**Permission justification**

The manifest asks for no permissions. Its only site access is the content script on `https://photos.google.com/*`. When the dashboard asks for a host permission justification, paste:

```
The content script runs only on photos.google.com. There it shows a small panel and clicks the photo checkboxes, the trash button and the confirm button of Google's dialog, the same clicks a user makes. It needs no other site. The background service worker only handles the toolbar button: it asks the content script to show the panel, or opens photos.google.com in a new tab. That needs no permission.
```

**Remote code**

Choose: No, I am not using remote code.

```
All code is in the package. The extension loads no scripts from anywhere and makes no network requests.
```

**Data usage**

- Tick none of the data types. The extension collects no user data.
- Tick all three certifications. It does not sell or transfer user data, does not use it for anything outside its single purpose, and does not use it for creditworthiness or lending.
- Privacy policy URL: https://jasonkrijgsman.github.io/bulk-delete-for-google-photos/#privacy

If a reviewer asks what the extension reads, answer:

```
The extension reads the email address of the signed-in account from the Google Photos page. It shows that address in its panel and stops when the account changes. It never saves it or sends it anywhere. It saves two things in the page's localStorage on photos.google.com: whether the panel is hidden, and the label of any button the user taught it. Nothing leaves the browser.
```

## Test instructions for the reviewer

```
Use a test Google account with a few photos. Open photos.google.com and sign in. The panel appears at the bottom right. Type 5 in the box, click Move to trash, then Yes, move them. Five photos move to the Google Photos trash. Restore them from the trash afterwards. The extension never empties the trash.
```

## Checklist

1. Register a Chrome Web Store developer account with the Google account that will own the listing. Google charges a one-time fee of US$5. Turn on 2-step verification for that account.
2. Tag a release `vX.Y.Z` that matches the manifest version. CI attaches `bulk-delete-for-google-photos.zip` to the release.
3. Download that ZIP, unzip it and load it unpacked once in Chrome, to check the package.
4. In the Developer Dashboard, click **New item** and upload the ZIP.
5. **Store listing**: paste the description, pick the category and the language, and upload the icon, the three screenshots and the small promo tile. Add the homepage and support URLs.
6. **Privacy practices**: paste the single purpose and the permission justification, choose no remote code, tick no data types, tick the three certifications and add the privacy policy URL.
7. **Distribution**: free, public, all regions.
8. **Test instructions**: paste the text above.
9. Submit for review. Google reviews every new item and every update before it goes live.
10. After approval, add the store link to the website and the README, and remove "It is not in the Chrome Web Store yet" from the install section of the website.
11. For each new version: raise the version, tag the release and upload the new ZIP to the same item.

## Notes

- The name says what it works with: "for Google Photos". Keep the line "Not affiliated with Google" in the description, and never add a Google logo to the images.
- Microsoft Edge Add-ons takes the same ZIP. It needs its own listing; the texts and images above fit there too.
- Keep the listing honest when the tool changes. Check the numbers in the description (250 per batch, 30 days in the trash, the measured speed) against the README before each update. Google changed the trash period from 60 to 30 days in September 2026.
