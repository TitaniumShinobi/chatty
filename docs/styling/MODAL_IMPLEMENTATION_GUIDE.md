# Modal Implementation Guide

## Critical Requirements for All Blocking Modals

All modals that block user interaction with the rest of the application **MUST** follow these requirements:

### 1. React Portal (REQUIRED)
- **All blocking modals MUST use `createPortal`** to render at `document.body` level
- This prevents stacking context issues from parent elements
- **Pattern:**
```typescript
import { createPortal } from 'react-dom'

// In your modal component:
if (!isVisible) return null

return createPortal(
  <div className="fixed inset-0 ...">
    {/* modal content */}
  </div>,
  document.body  // REQUIRED: Render at body level
)
```

### 2. Critical Z-Index (REQUIRED)
- **All blocking modals MUST use `Z_LAYERS.critical` (120)** for the backdrop
- Modal content should use `Z_LAYERS.critical + 1`
- Interactive elements within modal should use `Z_LAYERS.critical + 2`
- **Pattern:**
```typescript
import { Z_LAYERS } from '../lib/zLayers'

// Backdrop
<div style={{ zIndex: Z_LAYERS.critical }}>

// Modal content
<div style={{ zIndex: Z_LAYERS.critical + 1 }}>

// Interactive elements
<button style={{ zIndex: Z_LAYERS.critical + 2 }}>
```

### 3. Pointer Events (REQUIRED)
- Backdrop MUST have `pointerEvents: 'auto'` to block clicks
- Modal content MUST have `pointerEvents: 'auto'` and `onClick={(e) => e.stopPropagation()}`

### 4. hasBlockingOverlay Integration (REQUIRED)
- If modal is opened from Layout, it MUST be added to `hasBlockingOverlay` calculation
- Sidebar MUST use `hasBlockingOverlay` to adjust z-index and pointer-events

## Modal Checklist

When creating or modifying a modal, verify:

- [ ] Uses `createPortal` to render at `document.body`
- [ ] Backdrop uses `Z_LAYERS.critical` (120)
- [ ] Modal content uses `Z_LAYERS.critical + 1`
- [ ] Interactive elements use `Z_LAYERS.critical + 2`
- [ ] Backdrop has `pointerEvents: 'auto'`
- [ ] Modal content stops event propagation
- [ ] Added to `hasBlockingOverlay` in Layout.tsx (if applicable)
- [ ] Sidebar properly responds to `hasBlockingOverlay`
- [ ] Tested that modal appears above sidebar and all other UI
- [ ] Tested that clicks outside modal don't reach underlying elements

## Examples

### ✅ Correct Implementation (GPTCreator)
```typescript
import { createPortal } from 'react-dom'
import { Z_LAYERS } from '../lib/zLayers'

if (!isVisible) return null

return createPortal(
  <div 
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
    style={{ 
      zIndex: Z_LAYERS.critical,  // ✅ Critical z-index
      isolation: 'isolate',
      pointerEvents: 'auto'  // ✅ Blocks clicks
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    }}
  >
    <div
      style={{
        zIndex: Z_LAYERS.critical + 1,  // ✅ Content above backdrop
        pointerEvents: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}  // ✅ Prevents backdrop click
    >
      {/* modal content */}
    </div>
  </div>,
  document.body  // ✅ Portal to body
)
```

### ❌ Incorrect Implementation (What NOT to do)
```typescript
// ❌ No portal - renders inside component tree
return (
  <div style={{ zIndex: Z_LAYERS.modal }}>  // ❌ Wrong z-index
    {/* modal content */}
  </div>
)

// ❌ Missing pointer-events
<div style={{ zIndex: Z_LAYERS.modal }}>  // ❌ Clicks pass through
```

## Why These Requirements Exist

1. **Portal**: Prevents stacking context issues from parent elements (like `<main>`)
2. **Critical Z-Index**: Ensures modal is always above all other UI (sidebar, content, other modals)
3. **Pointer Events**: Ensures clicks are properly captured and don't reach underlying elements
4. **hasBlockingOverlay**: Ensures sidebar and other UI properly respond when modal is open

## Code Review Checklist

When reviewing modal PRs, check:

1. Does it use `createPortal`?
2. Does it use `Z_LAYERS.critical`?
3. Does it have proper pointer-events?
4. Is it added to `hasBlockingOverlay`?
5. Does sidebar respond correctly?

## References

- [Z-Axis Layering Rubric](./CHATTY_Z_AXIS_LAYERING_RUBRIC.md)
- [GPTCreator Implementation](../components/GPTCreator.tsx) - Reference implementation

