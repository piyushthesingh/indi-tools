# assets/

## Header + PWA icons

Drop these in when you have them (all optional):

| file | size | notes |
|------|------|-------|
| `mascot.png` | square | tiger headshot / single pose on a solid `#fcf4e9` background. Shown as the round avatar next to the title. |
| `sushi.png` | square, ~64-128 px | icon for the **Sushi** programme - shown on the profile (rightmost) nav button and in the programme picker. Missing → falls back to a 🍣 emoji. |
| `wasabi.png` | square, ~64-128 px | icon for the **Wasabi** programme. Missing → falls back to a 🥟 emoji. |
| `icon-192.png` | 192×192 | PWA icon |
| `icon-512.png` | 512×512 | PWA icon + maskable icon (keep the important content inside the centre ~80%) |
| `apple-touch-icon.png` | 180×180 | iOS home-screen icon |
| `favicon.png` | square | your source for the tab / install icons (already added) |

## Exercise images - `assets/ex/`

Each exercise's card shows an image from this folder. The mapping lives in
`index.html`, in the `IMG_BY_NAME` object near the top of the script - it maps a
slug of the exercise name to a filename here.

To add or change an image:

1. put the `.png` in `assets/ex/` (any sensible size, about 600-900 px wide, on the
   same `#fcf4e9` background so it blends into the page);
2. add or edit the entry in `IMG_BY_NAME`, e.g.
   `"straight-arm-lat-pulldown": "55-straight-arm-lat-pulldown.png"`.

For an exercise that has a variant switch (the `⇄` next to its name), the value
is a two-item array `[variant0, variant1]`; use `null` for a variant with no
image yet.

Currently unmapped (falls back to a plain "Primary / Assisting" muscle line):
`straight-arm-lat-pulldown` only. Every other exercise and variant has an image.

If an entry points at a file that isn't there, the card falls back to the muscle
line - no error.
