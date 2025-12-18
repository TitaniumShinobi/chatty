# Chatty Color Scheme Rubric

This document defines the official color scheme for Chatty's user interface.

## Primary Colors

### Background Colors
- **Main Area**: `#ffffeb` - Light cream background for all main content areas
- **Sidebar**: `#ffffd7` - Slightly darker cream for sidebar and navigation
- **Message Box**: `#ffffd7` - Input areas and message containers

### Accent Colors
- **Hover**: `#ffffd7` - For hover states on interactive elements
- **Selected**: `#ADA587` - For active/selected items and current selection
- **Buttons**: `#ADA587` - Primary button color and interactive elements
- **Lines**: `#ADA587` - Borders, dividers, and structural elements

### Text Colors
- **Primary Text**: `#3A2E14` - Main text color for readability
- **Placeholder Text**: `#ADA587` - Placeholder text in input fields and text areas
- **Timestamp Text**: `#ADA587` - Message timestamps (hover-only visibility)

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
- **Hover**: Use `#ffffd7` for hover states on interactive elements
- **Active/Selected**: Use `#ADA587` for current selection and active items
- **Buttons**: Use `#ADA587` for primary actions
- **Borders**: Use `#ADA587` for all structural lines

### Text Hierarchy
- **Primary Text**: `#3A2E14` for all main content
- **Secondary Text**: `#3A2E14` with reduced opacity (0.6-0.8) for labels and metadata
- **Placeholder Text**: `#ADA587` for all placeholder text in input fields, text areas, and search boxes
- **Timestamp Text**: `#ADA587` for message timestamps with hover-only visibility

### Message Timestamps
- **Color**: `#ADA587` - Uses accent color for subtle, elegant appearance
- **Visibility**: Hidden by default (`opacity-0`), visible on hover (`group-hover:opacity-100`)
- **Behavior**: Appears when hovering over message container (user or assistant messages)
- **Styling**: Small text size (`text-xs`), smooth opacity transition
- **Purpose**: Provides temporal context without cluttering the interface

### Form Inputs
- **Background**: Match container background (`2F2510` or `#ffffeb`)
- **Borders**: No visible borders
- **Text Color**: `#3A2E14` (day) and `ffffeb` (night) for input text
- **Placeholder Text**: `#ADA587` for placeholder text
- **Focus States**: Subtle focus ring using `#ADA587` if needed

## Implementation Notes

1. All backgrounds should use the cream color palette for consistency
2. Interactive elements should have clear hover states using `#ffffd7` and selected states using `#ADA587`
3. Text should maintain high contrast with the cream backgrounds
4. Borders and dividers should be subtle using the line color
5. The color scheme should create a warm, professional appearance
6. Hover and selected states should be visually distinct: hover uses a lighter cream (`#ffffd7`), selected uses the accent color (`#ADA587`)
7. Form inputs should blend with their container background - no visible borders or contrasting backgrounds
8. Form text uses primary text color (`#3A2E14`) for readability
9. Placeholder text uses accent color (`#ADA587`) for subtle distinction
10. Message timestamps use `#ADA587` and are hidden by default, appearing only on hover for a clean interface

## CSS Variables (Recommended)

```css
:root {
  --chatty-bg-main: #ffffeb;
  --chatty-bg-sidebar: #ffffeb;
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

This color scheme ensures a cohesive, warm, and professional user experience across all Chatty interfaces.

## Nighttime Color Scheme

### Background Colors
- **Main Area**: `#2F2510` - Dark cocoa for all main content areas
- **Sidebar**: `#ADA587` - Aged Soft Stone tone for the sidebar and navigation
- **Message Box**: `#3A2E14` - Slightly lighter tone for message containers and input areas

### Accent Colors
- **Hover**: `#3A2E14` - Dark cocoa for hover states on interactive elements
- **Selected**: `#ADA587` - For active/selected items and current selection
- **Buttons**: `#ffffd7` - Lemon yellow for interactive elements
- **Lines**: `#ffffd7` - Matching button tone for dividers and borders

### Text Colors
- **Primary Text**: `#ffffeb` - Lemon cloud for readability on dark backgrounds
- **Placeholder Text**: `#ADA587` - Placeholder text in input fields and text areas (with reduced opacity 0.7 for better contrast on dark backgrounds)

## CSS Variables (Night Mode)

```css
:root.night-mode {
  --chatty-bg-main: #2F2510;
  --chatty-bg-sidebar: #2F2510;
  --chatty-bg-message: #3A2E14;
  --chatty-hover: #3A2E14;
  --chatty-selected: #ADA587;
  --chatty-button: #ADA587;
  --chatty-line: #ADA587;
  --chatty-text: #ffffeb;
  --chatty-placeholder: #ADA587;
  --chatty-timestamp: #ADA587;
}