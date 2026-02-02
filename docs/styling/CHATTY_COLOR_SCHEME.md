# Chatty Color Scheme Rubric

This document defines the official color scheme for Chatty's user interface.

---

## Primary Colors (Day / Light Theme)

### Background Colors

* **Main Area**: `#fffff0` — Light cream background for all main content areas
* **Sidebar**: `#ffffd0` — Slightly darker cream for sidebar and navigation
* **Message Box**: `#ffffd7` — Input areas and message containers

### Accent Colors

* **Hover**: `#ffffd7` — Hover states on interactive elements
* **Selected**: `#ADA587` — Active / selected items
* **Buttons**: `#ADA587` — Primary buttons and actions
* **Lines**: `#ffffeb` — Borders, dividers, structural elements

### Text Colors

* **Primary Text**: `#3A2E14`
* **Secondary Text**: `#3A2E14` at 0.6–0.8 opacity
* **Placeholder Text**: `#ADA587`
* **Timestamp Text**: `#ADA587` (hover-only visibility)

---

## Usage Guidelines (Day Theme)

* Hover ≠ Selected:

  * Hover uses `#ffffd7`
  * Selected uses `#ADA587`
* Inputs blend with background (no visible borders)
* Text maintains high contrast against cream surfaces
* UI should feel warm, archival, and professional

---

## Message Timestamps (All Themes)

* **Color**: Accent tone
* **Visibility**: Hidden by default (`opacity-0`)
* **On Hover**: Visible (`group-hover:opacity-100`)
* **Size**: `text-xs`
* **Transition**: Smooth opacity fade
* **Purpose**: Temporal context without clutter

---

## CSS Variables — Day Theme

```css
:root {
  --chatty-bg-main: #fffff0;
  --chatty-bg-sidebar: #ffffd0;
  --chatty-bg-message: #ffffd7;

  --chatty-hover: #ffffd7;
  --chatty-selected: #ADA587;
  --chatty-button: #ADA587;
  --chatty-line: #ADA587;

  --chatty-text: #3A2E14;
  --chatty-placeholder: #ADA587;
  --chatty-timestamp: #ADA587;
}
```

---

## Nighttime Color Scheme (Outer Space Theme)

### Background Colors

* **Main Area**: `#000110` — Deep space background
* **Sidebar**: `#000110` — Unified cosmic surface
* **Message Box**: `#1A1C2B` — Space haze surface for messages and inputs

### Accent & Surface Colors

* **Hover**: `#1A1C2B` — Atmospheric hover highlight
* **Selected**: `#ADA587` — Authority / active state
* **Buttons**: `#ADA587` — Primary actions
* **Lines**: `#ADA587` — Dividers and borders

### Text Colors (Night Theme Rule)

* **ALL TEXT**: `#fffff0` (Cloud Lemon)

  * Primary text
  * Secondary text
  * Placeholder text
  * Timestamps
  * Labels & metadata
* Opacity may vary, **color may not**

---

## Night Theme Text Opacity Rules

* **Primary Text**: `#fffff0` at 1.0
* **Secondary / Metadata**: `#fffff0` at 0.6–0.8
* **Placeholder Text**: `#fffff0` at 0.6
* **Timestamps**: `#fffff0` at 0.6 (hover-only)

---

## CSS Variables — Night Mode (Final)

```css
:root.night-mode {
  --chatty-bg-main: #000110;
  --chatty-bg-sidebar: #000110;
  --chatty-bg-message: #1A1C2B;

  --chatty-hover: #1A1C2B;
  --chatty-selected: #ADA587;
  --chatty-button: #ADA587;
  --chatty-line: #ADA587;

  --chatty-text: #fffff0;
  --chatty-placeholder: rgba(255, 255, 240, 0.6);
  --chatty-timestamp: rgba(255, 255, 240, 0.6);
}
```

---

## Christmas Theme (Seasonal: December 1 – January 1 at 12:00am)

The Christmas theme is a seasonal overlay that activates automatically during the holiday period. It applies a deep forest green palette while inheriting the Night theme's text colors.

### Background Colors

* **Main Area**: `#0f1f0f` — Deep forest green
* **Sidebar**: `#0f1f0f` — Deep forest green (unified with main)
* **Message Box**: `rgba(173, 165, 135, 0.25)` — #ADA587 at 25% opacity (matches user bubbles)

### Accent & Highlight Colors

* **Hover / Highlight**: `#1a2d1a` — Forest highlight
* **Selected**: `#ADA587` — Authority / active state (inherited from Night)
* **Buttons**: `#ADA587` — Primary actions (inherited from Night)

### Star Animation Colors (Christmas-specific)

* **Starburst**: `#fffff0` — Cloud lemon starbursts
* **Nova**: `#ffffff` — Pure white nova effect
* **Rays**: `#ffd700` — Gold rays emanating from star

### Text Colors (Inherited from Night Theme)

* **ALL TEXT**: `#fffff0` (Cloud Lemon)
* Opacity rules follow Night theme conventions

---

## CSS Variables — Christmas Theme

```css
.theme-script-christmas[data-theme="night"],
.theme-script-christmas:root.night-mode,
[data-theme="night"].theme-script-christmas,
:root.night-mode.theme-script-christmas {
  --chatty-bg-main: #0f1f0f;
  --chatty-bg-sidebar: #0f1f0f;
  --chatty-bg-message: rgba(173, 165, 135, 0.25);
  --chatty-highlight: #1a2d1a;
  --chatty-star-starburst-color: #fffff0;
  --chatty-star-nova-color: #ffffff;
  --chatty-star-ray-color: #ffd700;
}
```

---

## Design Contract (Non-Negotiables)

1. Hierarchy is expressed via **opacity, not hue**
2. Hover ≠ Selected ≠ Background
3. `#ADA587` represents **authority**, never filler
4. Dark mode must feel **quiet, cosmic, and intentional**
5. No chocolate, no brown, no warm shadows in night mode
6. Space first. UI second.

---

This document is the authoritative reference for Chatty UI styling.