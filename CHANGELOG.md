# Changelog

## 1.0.0 (2026-09-25)

- First release.
- Moves photos from the Library or the Archive to the trash in batches of up to 250, either a set number or all of them.
- Shows the signed-in account and asks before it starts. Stops when the page or the account changes during a run.
- Clicks nothing off the Library and the Archive, and never a button that empties the trash or deletes for good.
- Reads the count Google shows before each batch, and stops if it cannot read it or if it is higher than planned.
- Checks after each batch that the photos are really gone.
- Finds Google's confirm button by its action code, in any language. Learns the trash button from one click when it does not know the interface language.
- Pauses while its tab is hidden.
