# StarToggleWithAssets Component Rubric

## Overview
This rubric defines the exact specifications for the `StarToggleWithAssets` component based on the General page implementation, serving as the reference standard for all settings tabs.

## Visual Specifications

### **Component State: OFF (Default)**
- **Two 4-point starburst icons** (`fourpointstarburst.svg`) visible
- **Color**: `#e294bc` (light pink/purple hue)
- **Positioning**: 
  - Left star: Positioned via `spacing` prop (pixel-based, not percentage)
  - Right star: Always `right: '0px'` (flush with right edge)
- **Spacing Configuration**:
  - `spacing="normal"` (default): `64px` from left edge → stars touch (0px gap)
  - `spacing="wide"`: `44px` from left edge → larger gap
  - `spacing="63px"` (most common): `63px` from left edge → 1px gap between stars
  - Custom pixel values: Any string containing `'px'` is used directly
- **Gap Calculation** (for `size="md"`):
  - Container width: `112px` (w-28)
  - Star width: `24px` (w-6)
  - Right star left edge: `112px - 24px = 88px` from container left
  - With `spacing="63px"`: Gap = `88px - 63px - 24px = 1px`
  - With `spacing="64px"` (normal): Gap = `88px - 64px - 24px = 0px` (touching)

### **Size Configuration**
- **Container**: `w-28 h-10` (112px × 40px) for `size="md"`
- **Individual Stars**: `w-6 h-6` (24px × 24px) for `size="md"`
- **Overall Scale**: 75% of original size (25% smaller)
- **Star Scale**: 80% of original star size

### **Background & Styling**
- **No background**: Toggle allows parent background to show through
- **No border**: Clean, minimal appearance
- **No shadow**: Flat design aesthetic

## Animation Specifications

### **Cartwheel Animation (Off → On)**
1. **Left star rotation**: 405 degrees (360° + 45°)
2. **Left star translation**: Moves to `calc(100% - 12px)` to center on right star
3. **Duration**: 600ms with `cubic-bezier(0.4, 0, 0.2, 1)` easing
4. **Transform origin**: `center`
5. **Final position**: Left star lands centered on right star (at `calc(100% - 12px)`)
6. **Opacity transition**: Left star fades out when `showEightPoint` becomes true (after 1000ms)

### **Multi-Stage Animation (if useNova=true)**
1. **Stage 1**: Cartwheel animation (600ms)
2. **Stage 2**: Replace with `eightpointstar.svg` (instant)
3. **Stage 3**: Replace with `eightpointnova.svg` (100ms later)
4. **Final state**: Single `eightpointnova.svg` with glow effects

## Hover Effects

### **Synchronized Highlighting**
- **Trigger**: Hover over entire toggle container
- **Effect**: Both stars simultaneously apply filter
- **Filter**: `hue-rotate(20deg) saturate(1.2) brightness(1.1)`
- **Color shift**: Towards stone color `#ADA587`
- **Implementation**: Use React refs for perfect synchronization

## Accessibility

### **ARIA Attributes**
- `role="switch"`
- `aria-checked={toggled}`
- `aria-disabled={disabled}`
- `aria-label="Toggle ${toggled ? 'on' : 'off'}"`
- `tabIndex={disabled ? -1 : 0}`

### **Keyboard Support**
- **Enter key**: Toggle state
- **Space key**: Toggle state
- **Focus management**: Proper tab order

## Implementation Details

### **Props Interface**
```typescript
interface StarToggleProps {
  toggled: boolean;
  onToggle: (toggled: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  spacing?: 'normal' | 'wide' | string; // 'normal' = 64px, 'wide' = 44px, or custom pixel value (e.g., "63px")
  useNova?: boolean; // Deprecated - no longer used in current implementation
}
```

### **Size Configurations**
```typescript
const sizeConfig = {
  sm: { container: 'w-24 h-8', star: 'w-5 h-5' },
  md: { container: 'w-28 h-10', star: 'w-6 h-6' },
  lg: { container: 'w-32 h-12', star: 'w-8 h-8' }
};
```

### **State Management**
- `isAnimating`: Prevents multiple simultaneous animations
- `showEightPoint`: Controls 8-point nova star appearance (set to true after 1000ms when toggling on)
- Animation timeout: 1200ms total (600ms cartwheel + 600ms buffer for nova appearance)
- Left star opacity: Fades out when `showEightPoint` becomes true

### **Spacing Prop Logic**
```typescript
const getLeftPosition = (spacing: string) => {
  if (spacing === 'normal') return '64px';
  if (spacing === 'wide') return '44px';
  // If it's a pixel value (contains 'px'), use it directly
  if (spacing.includes('px')) return spacing;
  // Default fallback
  return '64px';
};
```

## Usage Standards

### **General Tab Implementation**
- **Size**: `size="md"`
- **Spacing**: Default (`'normal'` = 64px, stars touch)
- **Container**: Light yellow background (`#feffaf`)
- **Icon**: ✨ emoji
- **Text**: "Show additional models"
- **Description**: "Display additional AI models in the model selector"

### **Common Spacing Usage Across Tabs**
- **DataControlsTab**: `spacing="63px"` (1px gap) - used for "Improve the model" and "Remote browser data"
- **PersonalizationTab**: `spacing="63px"` (1px gap) - used for all toggles
- **NotificationsTab**: `spacing="63px"` (1px gap) - used for all notification toggles
- **GeneralTab**: Default `'normal'` (64px, touching) - "Show additional models"
- **AccountTab**: Default `'normal'` (64px, touching) - "Name" toggle

### **Consistency Requirements**
- All settings tabs must use identical sizing
- Same hover effects across all instances
- Consistent animation timing
- Uniform accessibility implementation

## Quality Assurance

### **Visual Consistency**
- ✅ Two distinct 4-point stars in off state
- ✅ Proper spacing between stars (pixel-based via `spacing` prop)
- ✅ Most toggles use `spacing="63px"` for consistent 1px gap
- ✅ Default `spacing="normal"` (64px) makes stars touch (0px gap)
- ✅ Right star always flush with right edge (`right: '0px'`)
- ✅ Correct color (`#e294bc`)
- ✅ Appropriate sizing (`size="md"`)

### **Animation Quality**
- ✅ Smooth cartwheel rotation (405°)
- ✅ Left star moves to `calc(100% - 12px)` to center on right star
- ✅ Proper timing (600ms cartwheel, 1000ms total for nova appearance)
- ✅ Left star fades out when nova appears (opacity transition)
- ✅ Synchronized hover effects on both stars

### **Accessibility Compliance**
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Focus management
- ✅ ARIA attributes

## Reference Implementation
This rubric is based on the General page "Show additional models" toggle, which serves as the gold standard for all `StarToggleWithAssets` implementations across the settings modal.

---
*Last Updated: December 2024 - Updated with current pixel-based positioning system*
*Component: StarToggleWithAssets*
*Size: md (w-28 h-10, w-6 h-6 stars)*
*Spacing: Most tabs use 63px (1px gap), default is 64px (touching)*
*Positioning: Pixel-based via `spacing` prop, not percentage-based*