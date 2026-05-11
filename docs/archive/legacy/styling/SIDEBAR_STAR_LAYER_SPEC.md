# Sidebar Star Layer Spec

**Last Updated**: March 12, 2026

This document is the **only** source of truth for the sidebar star. Do not re-implement from transcripts or memory. Any change to layers, assets, sizes, or animation must update this file and the code together.

---

## Canonical recall (for agents / paste reference)

- **7 elements:** 1 nova pair (back), 1 ray pair (middle), 1 starburst pair (front), 1 center. Classes: `chatty-starburst-nova-left/right`, `chatty-starburst-ray-left/right`, `chatty-starburst-left/right`, `chatty-star`.
- **Z-index:** nova 5, ray 8, starburst 10, center 12. All burst elements `position: absolute` in `.chatty-star-wrapper`.
- **Sizes:** Nova and ray = 80% of wrapper. Starburst (front) only = 40% of wrapper (50% smaller). Center fills wrapper.
- **Hover:** Center `opacity: 0`. Nova/ray/starburst fade in (nova 0.9, ray 0.7, starburst 1). Rotations: starburst 7s, ray 14s, nova 28s; left ccw, right cw.
- **Light theme assets:** Nova `fourpointnova.svg`, Ray `fourpointray.svg`, Starburst `fourpointstarburst.svg`, Center `chatty_star.png`.
- **Dark theme assets:** Nova `lemonfourpointstarburst.svg`, Ray `fourpointray.svg`, Starburst `moonfourpointstarburst.svg`, Center moon Chatty star.
- **Implementation:** `src/components/Sidebar.tsx` (DOM + asset vars), `src/index.css` (sizes, z-index, hover, keyframes). Do not change behavior without updating this spec.

---

## Scope

This spec covers the star cluster rendered inside `.chatty-star-wrapper` in the sidebar header logo area.

Primary implementation files:

- `src/components/Sidebar.tsx`
- `src/index.css`

---

## Layer Model (Back -> Front)

The star system consists of 7 elements total:

- 6 elements: 3 pairs (nova, ray, starburst) of left/right
- 1 center star (`.chatty-star`)

Required stack order:

1. Nova pair (back)

- `.chatty-starburst-nova-left`
- `.chatty-starburst-nova-right`

2. Ray pair (middle)

- `.chatty-starburst-ray-left`
- `.chatty-starburst-ray-right`

3. Starburst pair (front burst)

- `.chatty-starburst-left`
- `.chatty-starburst-right`

4. Center star (top)

- `.chatty-star`

DOM order must match this stack order.

---

## Z-Index Contract

Within the wrapper, classes map to these z-layers:

- Nova classes: `z-index: 5`
- Ray classes: `z-index: 8`
- Starburst base class: `z-index: 10`
- Center star: `z-index: 12`

If z-index changes, update both CSS and this spec in the same change.

---

## Positioning Contract

- The six elements (nova pair, ray pair, and starburst pair) are absolutely positioned within `.chatty-star-wrapper`.
- Left/right layers use the same asset and differ by rotation direction on hover.
- The center star remains relatively positioned and fades on hover.

---

## Size Contract (Four-Point Star Scale)

- **Nova (back) and Ray (middle):** `80%` of `.chatty-star-wrapper` width and height. This matches the design-system “star scale” (80% of original) for four-point stars.
- **Front starburst layer (top):** `40%` of wrapper — 50% smaller than nova/ray; does not affect ray or nova.
- **Night mode:** `.chatty-starburst-front-tight` also uses 40%.
- Implemented in `src/index.css`: `.chatty-starburst` sets 80%; `.chatty-starburst-left` / `.chatty-starburst-right` override to 40% for the front layer only.

---

## Hover Behavior Contract

On `.chatty-star-wrapper:hover`:

- Center star fades out:
  - `.chatty-star { opacity: 0; }`
- The nova, ray, and starburst elements fade in:
  - `.chatty-starburst { opacity: 1; }`
  - Ray pair opacity: `0.7`
  - Nova pair opacity: `0.9`

Rotation timings:

- Starburst pair: `7s`
- Ray pair: `14s`
- Nova pair: `28s`

Rotation directions:

- Left classes: counter-clockwise (`chatty-starburst-ccw`)
- Right classes: clockwise (`chatty-starburst-cw`)

---

## Default Light Mode Asset Mapping (Original Theme)

For default day/light mode (no seasonal script):

- Back (nova classes): `fourpointnova.svg` ×2
- Middle (ray classes): `fourpointray.svg` ×2
- Front burst (starburst classes): `fourpointstarburst.svg` ×2
- Center: `chatty_star.png` (or default center asset), fades on hover

Stack: back = nova (`fourpointnova`), then ray (`fourpointray`), then starburst (`fourpointstarburst`), then center. Six burst elements + center; animation in `index.css` (7s / 14s / 28s).

---

## Default Dark Mode Asset Mapping

For default night mode (no seasonal script):

- Back (nova classes): `lemonfourpointstarburst.svg`
- Middle (ray classes): `fourpointray.svg`
- Front burst (starburst classes): `moonfourpointstarburst.svg`
- Center: moon Chatty star image

This produces:

- Rearmost: lemon starburst
- Middle: ray
- Front burst: moon starburst
- Top: center star

---

## Christmas Theme Asset Mapping

For the Christmas theme (both light and night variants):

- Back (nova classes): `whitefourpointnova.svg` ×2
- Middle (ray classes): `fourpointray.svg` ×2
- Front burst (starburst classes): `lemonfourpointstarburst.svg` ×2
- Center: `litChatty_star.svg` (single copy)

Notes:

- Sizes and timing **do not change**: nova/ray at 80%, front starburst at 40%, hover spins at 7s/14s/28s.
- Any Christmas-specific color tweaks must happen in the SVG assets or CSS variables; do not change the layering, sizes, or timing.

---

## Valentine's Day Theme Asset Mapping

For the Valentine's Day theme (both light and night variants):

- Back (nova classes): `passionfourpointnova.svg` ×2
- Middle (ray classes): `fourpointray.svg` ×2
- Front burst (starburst classes): `lemonfourpointstarburst.svg` ×2
- Center: `litChatty_star.svg`

Notes:

- Same size and timing contract as all other themes (7s/14s/28s; 80%/80%/40%).
- Colors follow the Valentine's section in `CHATTY_COLOR_SCHEME.md` (passion rose nova, golden rays, cloud‑lemon starburst).

---

## Seasonal Notes

Seasonal scripts may override assets and visibility rules, but the structural class model (nova/ray/starburst/center) should remain stable unless intentionally redesigning the system.

---

## Related Docs

- `docs/styling/CHATTY_COLOR_SCHEME.md` (timing and seasonal color guidance)
- `docs/styling/CHATTY_Z_AXIS_LAYERING_RUBRIC.md` (global app z-axis rules)
