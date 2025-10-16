# Chatty Color Scheme Rubric

This document defines the official color scheme for Chatty's user interface.

## Primary Colors

### Background Colors
- **Main Area**: `#ffffeb` - Light cream background for all main content areas
- **Sidebar**: `#ffffd7` - Slightly darker cream for sidebar and navigation
- **Message Box**: `#ffffd7` - Input areas and message containers

### Accent Colors
- **Highlight**: `#feffaf` - For hover states, active selections, and highlights
- **Buttons**: `#E1C28B` - Primary button color and interactive elements
- **Lines**: `#E1C28B` - Borders, dividers, and structural elements

### Text Colors
- **Primary Text**: `#4C3D1E` - Main text color for readability

## Usage Guidelines

### Page-Specific Applications
- **Search Popup**: `#ffffeb` background
- **Library Page**: `#ffffeb` background  
- **Codex Page**: `#ffffeb` background
- **Projects Page**: `#ffffeb` background
- **Explore Page**: `#ffffeb` background
- **GPTs Page**: `#ffffeb` background
- **GPT Creator**: `#ffffeb` background

### Interactive States
- **Hover**: Use `#feffaf` for subtle highlighting
- **Active/Selected**: Use `#feffaf` for current selection
- **Buttons**: Use `#E1C28B` for primary actions
- **Borders**: Use `#E1C28B` for all structural lines

### Text Hierarchy
- **Primary Text**: `#4C3D1E` for all main content
- **Secondary Text**: `#4C3D1E` with reduced opacity (0.6-0.8) for labels and metadata

## Implementation Notes

1. All backgrounds should use the cream color palette for consistency
2. Interactive elements should have clear hover states using the highlight color
3. Text should maintain high contrast with the cream backgrounds
4. Borders and dividers should be subtle using the line color
5. The color scheme should create a warm, professional appearance

## CSS Variables (Recommended)

```css
:root {
  --chatty-bg-main: #ffffeb;
  --chatty-bg-sidebar: #ffffd7;
  --chatty-bg-message: #ffffd7;
  --chatty-highlight: #feffaf;
  --chatty-button: #E1C28B;
  --chatty-line: #E1C28B;
  --chatty-text: #4C3D1E;
}
```

This color scheme ensures a cohesive, warm, and professional user experience across all Chatty interfaces.
