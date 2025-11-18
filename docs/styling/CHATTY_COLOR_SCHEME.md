# Chatty Color Scheme Rubric

This document defines the official color scheme for Chatty's user interface.

## Primary Colors

### Background Colors
- **Main Area**: `#ffffeb` - Light cream background for all main content areas
- **Sidebar**: `#ffffd7` - Slightly darker cream for sidebar and navigation
- **Message Box**: `#ffffd7` - Input areas and message containers

### Accent Colors
- **Highlight**: `#feffaf` - For hover states, active selections, and highlights
- **Buttons**: `#ADA587` - Primary button color and interactive elements
- **Lines**: `#ADA587` - Borders, dividers, and structural elements

### Text Colors
- **Primary Text**: `#3A2E14` - Main text color for readability

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
- **Buttons**: Use `#ADA587` for primary actions
- **Borders**: Use `#ADA587` for all structural lines

### Text Hierarchy
- **Primary Text**: `#3A2E14` for all main content
- **Secondary Text**: `#3A2E14` with reduced opacity (0.6-0.8) for labels and metadata

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
  --chatty-button: #ADA587;
  --chatty-line: #ADA587;
  --chatty-text: #3A2E14;
}
```

This color scheme ensures a cohesive, warm, and professional user experience across all Chatty interfaces.

## Nighttime Color Scheme

### Background Colors
- **Main Area**: `#2F2510` - Dark cocoa for all main content areas
- **Sidebar**: `#ADA587` - Aged Soft Stone tone for the sidebar and navigation
- **Message Box**: `#3A2E14` - Slightly lighter tone for message containers and input areas

### Accent Colors
- **Highlight**: `#3A2E14` - Dark cocoa for hover states and scrollbar highlights
- **Buttons**: `#ffffd7` - Lemon yellow for interactive elements
- **Lines**: `#ffffd7` - Matching button tone for dividers and borders

### Text Colors
- **Primary Text**: `#ffffeb` - Lemon cloud for readability on dark backgrounds

## CSS Variables (Night Mode)

```css
:root.night-mode {
  --chatty-bg-main: #2F2510;
  --chatty-bg-sidebar: #ADA587;
  --chatty-bg-message: #3A2E14;
  --chatty-highlight: #3A2E14;
  --chatty-button: #ADA587;
  --chatty-line: #ADA587;
  --chatty-text: #ffffeb;
}