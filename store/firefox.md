# Firefox: the userscript route

The extension is built for Chrome, Edge, Brave and other Chromium browsers. Firefox users run the same code as a userscript, through a userscript manager.

## What the userscript is

- `userscript/bulk-delete-for-google-photos.user.js` is `extension/remover.js` with a userscript header on top. `npm run build:userscript` builds it.
- It runs only on photos.google.com. It asks the manager for no extra rights (`@grant none`) and makes no network requests.
- Each release attaches it as `bulk-delete-for-google-photos.user.js`. Its header points `@downloadURL` and `@updateURL` at the latest release, so the manager can keep it up to date.
- It does the same as the extension: the same panel, the same checks and the same limits. It never empties the trash.

## Install it in Firefox

1. Install a userscript manager from addons.mozilla.org, such as Violentmonkey or Tampermonkey.
2. Open this link: https://github.com/JasonKrijgsman/bulk-delete-for-google-photos/releases/latest/download/bulk-delete-for-google-photos.user.js
3. The manager shows the script. Click **Install**.
4. Open photos.google.com. The panel appears at the bottom right.

If the manager does not show an install page, add the script by its link. In Violentmonkey, open the dashboard, click **+** and choose **Install from URL**. In Tampermonkey, open the dashboard, go to **Utilities** and use **Install from URL**. Paste the link from step 2.

## Other browsers

- Any browser with a userscript manager can run it the same way.
- In Chrome, Edge and Brave, use the extension. A userscript manager there also needs **Allow User Scripts** turned on in its extension details (Chrome 138 and later; older versions use Developer mode).
- Use the extension or the userscript, not both.

## Testing status

- The first live runs used the extension, on the Dutch interface of Google Photos. The userscript runs the same code and is new in version 1.1.0.
- The website and the README do not claim a live run of the userscript in Firefox. Keep it that way until one passes, then say so in both.
- If it does not start, ask for the browser, the manager and their versions in the bug report.

## Reach more people

- Userscript users search script sites. Posting the userscript on Greasy Fork puts it where they look. Greasy Fork can sync a script from a URL, so point it at the release link above and it follows new versions.
- A Firefox add-on on addons.mozilla.org is possible later. It needs a few Firefox-specific manifest keys and its own review. Until then, the userscript is the Firefox route.
