# assets/

## Icons

| file | size | notes |
|------|------|-------|
| `mascot.png` | square | Tiger headshot on `#fcf4e9`. The build makes `mascot-web.jpg` from it, for the finish sheet and share image. |
| `icon-192.png` | 192×192 | PWA icon |
| `icon-512.png` | 512×512 | PWA icon + maskable icon (keep the important part inside the centre ~80%) |
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon |
| `favicon.png` | square | source for the tab and install icons |

Programme icons are emoji now, set in the programme editor, so `sushi.png` and
`wasabi.png` are no longer used.

## Exercise images - `assets/Exercises/`

Source art goes here as PNG, about 1200-1800 px wide, on the same `#fcf4e9`
background. The app never loads these big files directly. `tools/build.py`
turns each one into:

- `web/<name>.jpg`, 720 px, for the exercise sheet
- `thumb/<name>.jpg`, 320 px, for cards and lists

`<name>` is the file name lower-cased, with stray spaces and apostrophes
removed. Generated JPEGs whose PNG has been deleted are cleaned up on the
next build.

### Adding images for more exercises

1. Name the PNG after the exercise as it appears in the catalogue spreadsheet,
   as a slug. A leading number is allowed:
   - "Front squat" → `front-squat.png` or `212-front-squat.png`
   - "World's greatest stretch" → `worlds-greatest-stretch.png`
   - Names with a slash or "or" match either side: "Pec deck / machine fly" →
     `pec-deck.png` or `pec-deck-machine-fly.png`
2. Run `python3 tools/build.py`. It lists the exercises that still have no
   image, and any image it couldn't link.

If a file name can't follow the rule, add the catalogue ID to
`tools/image-map.json`, e.g. `"87": "pull-ups"`.

Exercises without art show a tile with the muscle name instead. Nothing breaks.

The images used before September 2026 are in
`../_backups/workout-assets-ex-old-images/`, outside the site folder.
