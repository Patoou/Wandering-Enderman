# Wandering Enderman (Firefox Extension)

This WebExtension drops an animated Enderman onto every page you visit. The Enderman wanders around the viewport, picks up small DOM elements, carries them for a short ride, and then returns them to their original spots. Sprite animations are driven by the pixel-art frames found in the `frames/` directory.

## Behaviour

- He materialises for 1–3 minutes every hour, spends most of that time idling or strolling, and occasionally inspects nearby elements.
- Calm wandering uses `walk*.png` frames; angry phases rely on their `walk-angry*` counterparts.
- The Enderman occasionally hunts your mouse cursor, using the `walk-hunt*.png` sprites (and their angry variants).
- While angry, the hunts and element grabs occur more frequently and movement speed increases.
- Only reasonably sized elements (roughly card-sized or smaller) are selected so page layouts stay intact.
- He walks up to a chosen element before snatching it, then carries it around before returning it.
- Spawn effects (`spawn*.png`) play when he first appears and whenever he reaches you during a hunt—he teleports away and resumes wandering somewhere else.

## Install for development

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file that lives inside the `enderman-firefox-extension/` folder (Firefox will load the whole folder automatically).
4. Visit any tab to watch the Enderman explore the page.

The extension runs entirely as a content script, so refreshing the page (or the extension) is enough to pick up changes during development.

## Folder structure

- `manifest.json` – WebExtension manifest (MV3).
- `scripts/enderman.js` – Content script controlling the animation and grabbing behaviour.
- `styles/enderman.css` – Styling for the Enderman and placeholders.

Temporary add-ons are removed when Firefox restarts. Load the manifest again if you want the Enderman back.

## Credits

- Pixel-art Enderman sprites by [hansungkee](https://github.com/hansungkee).
