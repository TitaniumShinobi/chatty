# 🧭 Chatty Z-Axis & Layering Rubric

> Objective: keep the "active surface" (what the user is interacting with **right now**) on top, regardless of viewport constraints or stacked UI states.

---

## 🎯 Outcomes To Protect
- **Active overlays always win** – when search, projects, settings, sharing, or critical alerts are open they must sit above sidebar + main shell.
- **Sidebar remains interactive only when nothing else is blocking it** – it should never cover a modal, but it must stay above scrollable chat content when it is the focused surface.
- **Hover/dropdown surfaces inherit the focus of their parent** – popovers opened from the sidebar/settings cannot hide underneath scroll regions or modals.
- **Critical fallbacks trump everything** – storage failures, destructive confirmations, and nested confirmation modals always sit above base modals.
- **Small viewport parity** – shrinking the browser window cannot introduce new stacking bugs; all layers must respect the same ordering tokens.

---

## 🗂 Layer Scale (defined in `src/lib/zLayers.ts`)

| Layer Token            | Value | Intended Usage |
|------------------------|-------|----------------|
| `base` / `content`     | 0–5   | default layout + chat area |
| `sidebarMuted`         | 8     | sidebar when an overlay is blocking interaction |
| `sidebar`              | 20    | sidebar when the user is actively browsing conversations |
| `popover`              | 40    | dropdowns, menus, command palettes tied to a parent surface |
| `floatingPanel`        | 45    | HUD elements such as action menus or inline inspectors |
| `overlay` / `modal`    | 50–60 | **DEPRECATED** - Use `critical` for blocking modals. Legacy value for non-blocking overlays. |
| `toast`                | 70    | transient notifications + debug/status panels |
| `critical`             | 120   | **REQUIRED for all blocking modals** (Search, Projects, Settings, Share, GPT Creator, Auth, etc.) + app-halting states (Storage failure, destructive confirmations, export dialogs) |

**Rules**
1. Never hard-code `zIndex`/`z-xx` strings—import `Z_LAYERS` (or `getZIndex`) and reference a token.
2. Popovers/dropdowns inherit their parent focus, so use `Z_LAYERS.popover` or `getZIndex('popover', offset)` inside the parent component.
3. Critical flows should be explicit about offsets (example: `getZIndex('modal', 5)`) when a modal sits on top of another modal.

---

## ✅ Implementation Checklist

### 1. Shared Infrastructure
- [x] `src/lib/zLayers.ts` exports canonical layer values + helper `getZIndex`.
- [x] `Sidebar` receives `hasBlockingOverlay` and dynamically swaps between `sidebar` and `sidebarMuted`.
- [x] Layout computes `hasBlockingOverlay` whenever search/projects/settings/share/storage fallback are open.

### 2. Structural Surfaces
- [x] Sidebar root uses `sidebar`/`sidebarMuted`.
- [x] Sidebar navigation buttons use `sidebarZIndex + 1` so focus rings stay above the column.
- [x] Sidebar conversation menus + user menu pin to `popover`.

### 3. Global Overlays
- [x] **All blocking modals MUST use React Portal** (`createPortal`) to render at `document.body` level
- [x] **All blocking modals MUST use `Z_LAYERS.critical` (120)** for backdrop to ensure they're always on top
- [x] Search Popup, Projects Modal, Settings Modal, Share Conversation Modal, GPT Creator, GPTs Modal, Auth Modal, Theme Customizer, Drift History, Runtime Dashboard dialogs, Mode Toggle panel, Data Import/Export/Delete flows all use `Z_LAYERS.critical` with React Portal.
- [x] Nested confirmations (e.g., export confirmation inside Settings) call `getZIndex('critical', offset)` so they sit above their parent modal.
- [x] Storage failure fallback + other emergency panels rely on `Z_LAYERS.critical`.
- [x] **See [Modal Implementation Guide](./MODAL_IMPLEMENTATION_GUIDE.md) for complete requirements**

### 4. Popovers & Suggestions
- [x] Action menu, command suggestions, General/Data Control dropdowns, Account tab tooltips, Library selection controls all reference `Z_LAYERS.popover`.
- [x] Toast/status/debug indicators use `Z_LAYERS.toast`, so they float above popovers but below modals.

### 5. Testing / Verification
1. **Viewport squeeze**: shrink the browser (or use responsive mode) and ensure:  
   - Opening Projects/Search hides the sidebar visually & consumes clicks.  
   - Closing the overlay immediately restores sidebar interactivity.
2. **Stacked modals**: open Settings → Data export confirmation → confirm states; each nested screen must appear above the previous one and still block the sidebar.
3. **Sidebar focus**: with no overlays open, hover menus and dropdowns should never render beneath main content.
4. **Critical alert priority**: trigger `StorageFailureFallback` (or simulate via dev tools) and confirm it overrides every other layer.

---

## 📌 When Adding New UI

### For Modals (Blocking Overlays)
**CRITICAL**: All blocking modals MUST follow the [Modal Implementation Guide](./MODAL_IMPLEMENTATION_GUIDE.md):
1. Use `createPortal` to render at `document.body`
2. Use `Z_LAYERS.critical` (120) for backdrop
3. Add to `hasBlockingOverlay` in Layout.tsx
4. Ensure proper pointer-events

### For Non-Modal UI
1. Decide whether the element is **local** (within a surface) or **global** (blocks the whole app).
2. Import `{ Z_LAYERS }` (and optionally `getZIndex`) and assign the closest matching token.
3. If the surface should become inactive when another layer opens, expose a boolean (similar to `hasBlockingOverlay`) and downshift its z-index/pointer events.
4. Add a quick note in the PR/commit referencing this rubric so future contributors inherit the layering discipline.

Following this rubric keeps layering predictable, prevents "z-index wars," and guarantees the user’s current activity always owns the z-axis.***
