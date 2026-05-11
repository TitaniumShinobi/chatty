# Chat Interface Layout

Source of truth:
- `src/pages/Chat.tsx`
- `src/components/ChatArea.tsx`
- `src/components/MessageBar.tsx`
- `src/components/SendButton.tsx`
- `src/components/SendButton.module.css`
- `src/components/MessageBar.module.css`

Supersedes:
- `docs/archive/legacy/debugging/SCROLL_BUTTON_FIX.md` for scroll-to-bottom placement. The archived note is useful history, but its viewport-fixed placement guidance is no longer the active standard.

## Standard

The chat surface owns its own x-axis. Floating controls that belong to the conversation content must align to the chat window, not to the browser viewport.

The scroll-to-bottom control must share the same x-axis as the centered "Load earlier messages" pill. In practice, that means centering it relative to the chat panel container, even when a sidebar is present.

The composer send/continue button is not the scroll-to-bottom button. It lives inside the composer controls and must stay in the composer control lane unless the task explicitly asks to change the send button.

## Placement Rules

1. Center conversation-level floating controls against the chat panel, not `window.innerWidth`.
2. Preserve the control's y-axis unless the task explicitly asks for vertical movement.
3. Do not move `MessageBar` or `SendButton` to satisfy a scroll-to-bottom request.
4. Treat `aria-label="Scroll to bottom"` as the scroll control target.
5. Treat `aria-label="Send message"`, `aria-label="Continue conversation"`, and `aria-label="Retry / force prompt"` as composer send controls.
6. If a screenshot points at a right-edge composer circle, verify whether it is the send/continue control before editing.
7. Keep active and fallback chat surfaces aligned:
   - `src/pages/Chat.tsx` is the routed chat page.
   - `src/components/ChatArea.tsx` is the older/alternate chat surface.

## Current Implementation

`src/pages/Chat.tsx` renders the scroll-to-bottom button inside the chat page shell. It should use chat-window-relative centering, such as:

```tsx
<div
  className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-40"
  style={{ bottom: composerFooterHeight + 20 }}
>
```

`src/components/ChatArea.tsx` should follow the same rule for its alternate surface:

```tsx
<div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-24 z-[100]">
```

These examples intentionally use `absolute` positioning in the chat surface coordinate system. Do not replace them with `fixed left: 50vw` unless the product direction changes.

## Rubric

Passing changes:
- The scroll-to-bottom control center matches the chat panel center or the "Load earlier messages" pill center.
- The y-axis value is unchanged when the request is horizontal-only.
- The composer send/continue button remains in its existing composer lane.
- Both `Chat.tsx` and `ChatArea.tsx` are checked when changing scroll control placement.
- The change uses existing layout patterns before adding new abstractions.

Failing changes:
- Centering against the full browser viewport while the sidebar is visible.
- Moving `MessageBar`, `SendButton`, or composer controls for a scroll-button task.
- Changing the bottom offset, footer height calculation, or composer spacing during a horizontal-only request.
- Updating only the inactive/fallback chat surface and missing the active routed chat page.
- Following archived placement notes without checking the current live standard.

## Verification

When a browser check is available, compare element centers instead of eyeballing:

1. Find the centered "Load earlier messages" button.
2. Find the button with `aria-label="Scroll to bottom"`.
3. Compare their `getBoundingClientRect().left + width / 2` values.
4. They should match within a small visual tolerance.
5. Do not compare the scroll button to `window.innerWidth / 2` when the sidebar is visible.

If the scroll button is not currently visible, compare it to the chat panel center after forcing or reaching a scrolled-up state.

