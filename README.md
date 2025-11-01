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

## Installation

1. Zip the contents of this folder (keeping `manifest.json` at the archive root).
   ```bash
   cd enderman-firefox-extension
   zip -r ../wandering-enderman.zip .
   ```
2. In Firefox, open `about:addons` and use the gear menu → **Install Add-on From File…**.
3. Select the generated ZIP file to install the extension permanently.

The bundled manifest already declares a `browser_specific_settings.gecko.id` so Firefox accepts the package; adjust it if you plan to distribute the add-on publicly.

## Folder structure

- `manifest.json` – WebExtension manifest (MV3).
- `scripts/enderman.js` – Content script controlling the animation and grabbing behaviour.
- `styles/enderman.css` – Styling for the Enderman and placeholders.
- `frames/` – Pixel-art sprite sheets.

## Credits

- Pixel-art Enderman sprites by [hansungkee](https://x.com/hansungkee1).
