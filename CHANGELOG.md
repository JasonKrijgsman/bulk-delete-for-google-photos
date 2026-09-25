# Changelog

## 1.0.0 (2026-09-25)

- First release.
- Moves photos from the Library or the Archive to the trash in batches of up to 250, either a set number or all of them.
- Shows the signed-in account and asks before it starts. Stops when the page or the account changes during a run.
- Clicks nothing off the Library and the Archive. Never clicks a button, and never confirms a dialog, that speaks of emptying the trash or deleting for good.
- Reads the count Google shows before each batch, and stops if it cannot read it or if it is higher than planned.
- Confirms only a dialog that stays the only new one and carries both of Google's dialog codes. Checks that the selection disappears and that the photos are really gone.
- Finds Google's confirm button by its dialog code. Learns the trash button from one click when it does not know the interface language, and then lets the user confirm that batch too.
- Pauses while its tab is hidden.
