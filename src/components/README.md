# Chatty UI Components

## SendButton

Circular send button used in the chat input (MessageBar). Clicking it sends the current message (same as Enter) or triggers retry when the last response was an error.

- **Location:** `SendButton.tsx` + `SendButton.module.css`
- **Props:** `onClick`, `disabled?`, `animating?`, `ariaLabel?` (default: "Send message")
- **Animation:** On press the circle contracts to scale ~0.82 over ~140ms, then releases to 1.0. Uses CSS `transform: scale()` and box-shadow; respects `@media (prefers-reduced-motion: reduce)` (no scale animation when reduced motion is preferred).
- **Touch target:** Minimum 44px for accessibility; visual circle is 36px.
- **Programmatic trigger:** To trigger send from outside, call the same handler passed to `onClick` (e.g. the parent’s submit or retry handler). The button does not expose an imperative ref; the parent (MessageBar) owns the submit/retry logic.
- **Empty submit behavior:** `MessageBar` can opt into `allowEmptySubmit` to support Character.AI-style "continue turn" sends (no new user text, just advance assistant turn).

**Tests:** `src/tests/SendButton.test.tsx` covers export and props contract in Node. `src/tests/MessageBar.test.ts` covers send-enable logic, including empty-submit continuation mode.
