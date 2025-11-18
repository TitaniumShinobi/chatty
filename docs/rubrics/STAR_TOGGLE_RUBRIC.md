# StarToggleWithAssets Component Rubric

## Overview
This rubric defines the exact specifications for the `StarToggleWithAssets` component based on the General page implementation, serving as the reference standard for all settings tabs.

## Visual Specifications

### **Component State: OFF (Default)**
- **Two 4-point starburst icons** (`fourpointstarburst.svg`) visible
- **Color**: `#e294bc` (light pink/purple hue)
- **Positioning**: 
  - Left star: `left: 35%` from container edge
  - Right star: `right: 0` (flush with right edge)
- **Gap Between Stars**:
  - When `size="md"`: minimum **6px** space between closest edges of each star
  - Use explicit `margin-left` or calculated `transform: translateX(-100% + 6px)` during animation
  - Ensure spacing remains consistent across all toggle placements

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
2. **Left star translation**: `translateX(-100%)` to land flush on right star
3. **Duration**: 600ms with `cubic-bezier(0.4, 0, 0.2, 1)` easing
4. **Transform origin**: `center`
5. **Final position**: Left star lands exactly on top of right star

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
  useNova?: boolean;
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
- `showEightPoint`: Controls 8-point star appearance
- `showNova`: Controls nova star appearance
- Animation timeout: 600ms for cartwheel completion

## Usage Standards

### **General Tab Implementation**
- **Size**: `size="md"`
- **Nova**: `useNova={false}`
- **Container**: Light yellow background (`#feffaf`)
- **Icon**: ✨ emoji
- **Text**: "Show additional models"
- **Description**: "Display additional AI models in the model selector"

### **Consistency Requirements**
- All settings tabs must use identical sizing
- Same hover effects across all instances
- Consistent animation timing
- Uniform accessibility implementation

## Quality Assurance

### **Visual Consistency**
- ✅ Two distinct 4-point stars in off state
- ✅ Proper spacing between stars (35% left, 0% right)
- ✅ Correct color (`#e294bc`)
- ✅ Appropriate sizing (`size="md"`)

### **Animation Quality**
- ✅ Smooth cartwheel rotation (405°)
- ✅ Flush landing on right star
- ✅ Proper timing (600ms)
- ✅ Synchronized hover effects

### **Accessibility Compliance**
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Focus management
- ✅ ARIA attributes

## Reference Implementation
This rubric is based on the General page "Show additional models" toggle, which serves as the gold standard for all `StarToggleWithAssets` implementations across the settings modal.

---
*Last Updated: Based on General page implementation*
*Component: StarToggleWithAssets*
*Size: md (w-28 h-10, w-6 h-6 stars)*
*State: Off (two 4-point stars with gap)*