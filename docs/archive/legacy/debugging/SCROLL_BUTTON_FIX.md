# Scroll-to-Bottom Button — Fix Log

**Date**: March 12, 2026
**Files touched**: `src/components/ChatArea.tsx`, `src/pages/Chat.tsx`

---

## Problem

The scroll-to-bottom button (ChevronDown arrow) was not appearing in the chat view even when the user was scrolled far above the latest message.

---

## Affected Surfaces

There are two separate chat render surfaces in the codebase. The issue was present in both:

| File                          | Used by                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `src/components/ChatArea.tsx` | Address Book contacts (Nova, Sera, Katana) and older chat views |
| `src/pages/Chat.tsx`          | Zen, Lin, GPT threads routed via React Router                   |

---

## Root Cause

In both files, `showScrollButton` state is computed inside a scroll event listener. The state initialized to `false` and only updated when a scroll event fired. If the page opened already scrolled away from bottom (e.g. on a long existing thread), no scroll event fired on mount, so the button never appeared.

Additionally, in `ChatArea.tsx`, the button was rendered _outside_ the scroll container in a `relative` wrapper, making its `absolute -top-N` positioning fragile when footer/input area height changed.

---

## Fix Applied

### `src/components/ChatArea.tsx`

1. Added `checkScrollPosition()` call immediately after attaching the scroll listener so visibility is evaluated on mount and on every message/conversation change:

   ```ts
   container.addEventListener("scroll", checkScrollPosition);
   checkScrollPosition(); // ← run once immediately
   ```

   Also added RAF + setTimeout(120ms) for post-layout initialization, and `resize` listener.

2. Moved `distanceFromBottom` calculation to be explicit:

   ```ts
   const distanceFromBottom =
     container.scrollHeight - (container.scrollTop + container.clientHeight);
   const isNearBottom = distanceFromBottom <= 80;
   ```

3. Moved button to a `fixed` position at `right-6 bottom-24` with `z-[100]`, rendered unconditionally when conversation has messages, with full opacity when scrolled up and reduced opacity when near bottom:
   ```tsx
   {
     conversation && conversation.messages.length > 0 && (
       <div className="pointer-events-none fixed right-6 bottom-24 z-[100]">
         <button
           onClick={scrollToBottom}
           style={{ opacity: showScrollButton ? 1 : 0.55 }}
         >
           <ChevronDown size={20} />
         </button>
       </div>
     );
   }
   ```

### `src/pages/Chat.tsx`

Same pattern applied — `onScroll()` called immediately after attaching listener, button moved to `fixed left-1/2 -translate-x-1/2 bottom-28 z-40`.

---

## Notes

- The `fixed` placement means the button positions itself relative to the viewport, not the chat container — this is intentional so it remains visible regardless of footer/mirror widget layout changes introduced by the Mirror screen-sharing feature (commit `26d25c9`).
- The decision to keep it always-rendered (opacity fade vs display toggle) was made to prevent the mount/unmount timing problem from recurring.
