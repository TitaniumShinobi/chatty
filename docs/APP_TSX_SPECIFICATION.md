# App.tsx Specification

## Overview
This document specifies the exact requirements for `chatty/src/App.tsx` - the login/signup screen component.

## Visual Design

### Color Scheme (Lemon/Chocolate Theme)
- **Primary Background**: `var(--chatty-bg-main)` - Lemon (#ffffeb) for day mode, Chocolate (#7c2d12) for night mode
- **Sidebar/Card Background**: `var(--chatty-bg-sidebar)` - Slightly different shade
- **Text**: `var(--chatty-text)` - Dark chocolate for day, light lemon for night
- **Button/Accent**: `var(--chatty-button)` - Chocolate brown (#7c2d12) for day, Lemon (#ffffeb) for night
- **Text Inverse**: `var(--chatty-text-inverse)` - For text on buttons

### Logo
- **Image**: `/assets/logo/Chatty.png` (NOT the hexagonal SVG logo)
- **Height**: 256px
- **Position**: Centered at top, with negative margin-top (-50px) and negative margin-bottom (-70px)
- **Display**: Block, auto width, max-width 100%

### Layout
- **Container**: Centered card, 420px width, max-width 100%
- **Padding**: 0px 24px 24px 24px
- **Border Radius**: 12px
- **Box Shadow**: 0 10px 30px rgba(0,0,0,.15)
- **Background**: `var(--chatty-bg-sidebar)`

### Typography
- **Tagline**: "Activate the ultimate you" - opacity-75, mb-6, text-center
- **Labels**: Block text-sm opacity-70 mb-2
- **Inputs**: Full width, rounded-lg, using CSS variables for colors

## Functional Requirements

### Authentication Modes
1. **Login Mode** (default)
   - Shows OAuth buttons first
   - "or" divider
   - Email/password form below

2. **Signup Mode**
   - Shows email/password form first (with name field)
   - OAuth buttons below
   - Password confirmation field
   - Terms of Service checkboxes
   - Cloudflare Turnstile verification

### OAuth Buttons (All 4 Required)
1. **Google** - Black button (#000000) with Google SVG icon
2. **Microsoft** - Blue button (#0078d4) with Microsoft SVG icon  
3. **Apple** - Black button (#000000) with Apple SVG icon
4. **GitHub** - Dark gray button with GitHub SVG icon

All buttons:
- Full width
- py-3 rounded-lg
- Flex items-center justify-center gap-3
- Font-semibold
- Hover effects

### Email/Password Form
- **Name Field** (signup only): Required, placeholder "Your name"
- **Email Field**: Required, type="email", placeholder "Email"
- **Password Field**: Required, type="password", placeholder "Password"
- **Confirm Password Field** (signup only): Required, must match password
- All inputs use CSS variables for theming

### Terms of Service (Signup Only)
- **Chatty Terms**: Checkbox with label linking to Terms of Service
- **VVAULT Terms**: Checkbox with label linking to VVAULT Terms
- Both must be checked to proceed with signup
- Styled with opacity-70 text-sm

### Cloudflare Turnstile (Signup Only)
- **Site Key**: From environment variable `VITE_TURNSTILE_SITE_KEY`
- **Theme**: 'auto' (adapts to day/night mode)
- **Size**: 'normal'
- **Callbacks**:
  - `callback`: Sets turnstile token
  - `error-callback`: Sets error message (parameter prefixed with `_` to avoid unused warning)
  - `expired-callback`: Resets token and shows error
- **Error Display**: Shows error message if verification fails

### Signup Success Component
- Shows after successful signup
- Message: "Account created successfully!"
- Button: "Continue to Login" - switches to login mode

### Form Validation
- All fields required
- Email format validation
- Password confirmation must match
- Terms must be accepted (signup)
- Turnstile token must be present (signup)
- Error messages displayed below form

### State Management
- `user`: User object or null
- `isLoading`: Initial auth check state
- `mode`: 'login' | 'signup'
- `email`, `password`, `confirmPassword`, `name`: Form fields
- `acceptTerms`, `acceptVVAULTTerms`: Checkbox states
- `authError`: Error message string
- `isAuthenticating`: Loading state during auth
- `signupSuccess`: Boolean for success state
- `turnstileToken`, `turnstileError`: Turnstile state

### Redirect Logic
- If user exists and not loading → redirect to `/app`
- Uses `useEffect` with `hasRedirectedRef` to prevent multiple redirects
- Only redirects if on root path (`/` or `''`)

### Loading States
- **Initial Load**: Shows "Loading…" with opacity-70
- **Redirecting**: Shows "Redirecting…" with opacity-70
- **Authenticating**: Disables form, shows loading state

## Technical Requirements

### Imports
```typescript
import React, { useEffect, useState } from 'react'
import {
  fetchMe,
  loginWithGoogle,
  loginWithMicrosoft,
  loginWithApple,
  loginWithGithub,
  loginWithEmail,
  signupWithEmail,
  type User,
} from './lib/auth'
```

### Cloudflare Turnstile Types
```typescript
declare global {
  interface Window {
    turnstile: {
      render: (element: string | HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback': (error: string) => void;
        'expired-callback': () => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact';
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}
```

### Script Loading
- Cloudflare Turnstile script must be loaded from `https://challenges.cloudflare.com/turnstile/v0/api.js`
- Script should be loaded in `index.html` or via dynamic import

### Error Handling
- All auth functions wrapped in try-catch
- Errors displayed to user via `authError` state
- Network errors handled gracefully

## File Size
- Expected: ~849 lines
- Includes all OAuth handlers, form handlers, Turnstile integration, and UI components

## CSS Variables Required
Defined in `src/index.css`:
```css
:root {
  --chatty-bg-main: #ffffeb; /* Lemon - day mode */
  --chatty-bg-sidebar: /* Slightly different shade */
  --chatty-text: #7c2d12; /* Chocolate - day mode */
  --chatty-button: #7c2d12; /* Chocolate - day mode */
  --chatty-text-inverse: #ffffeb; /* Lemon - day mode */
}

[data-theme="night"] {
  --chatty-bg-main: #7c2d12; /* Chocolate - night mode */
  --chatty-text: #ffffeb; /* Lemon - night mode */
  --chatty-button: #ffffeb; /* Lemon - night mode */
  --chatty-text-inverse: #7c2d12; /* Chocolate - night mode */
}
```

## Critical Features Checklist
- ✅ Lemon/chocolate theme (CSS variables)
- ✅ Chatty.png logo (not hexagonal SVG)
- ✅ All 4 OAuth buttons (Google, Microsoft, Apple, GitHub)
- ✅ Email/password login
- ✅ Signup mode with name field
- ✅ Password confirmation
- ✅ Terms of Service checkboxes (Chatty + VVAULT)
- ✅ Cloudflare Turnstile verification
- ✅ Signup success component
- ✅ Proper error handling
- ✅ Loading states
- ✅ Redirect logic
- ✅ Form validation

## Anti-Patterns to Avoid
- ❌ Do NOT use hardcoded orange/red colors
- ❌ Do NOT use hexagonal SVG logo
- ❌ Do NOT remove OAuth buttons
- ❌ Do NOT remove Turnstile verification
- ❌ Do NOT remove Terms of Service checkboxes
- ❌ Do NOT simplify to basic login only
- ❌ Do NOT use localStorage for session (use fetchMe API)
