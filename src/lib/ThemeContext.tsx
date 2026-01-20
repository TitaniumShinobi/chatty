import React, { createContext, useContext, useEffect, useState } from 'react'
import { type User } from './auth'

export type Theme = 'light' | 'night' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'night' // The actual resolved theme (when system is selected)
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
  user: User | null
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, user }) => {
  const [theme, setTheme] = useState<Theme>('system')
  const [systemTheme, setSystemTheme] = useState<'light' | 'night'>('light')

  // === SYSTEM THEME DETECTION - START ===
  useEffect(() => {
    // Detect initial system theme
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const detectedTheme = darkModeQuery.matches ? 'night' : 'light'
    console.log('[Theme] System detection:', { 
      prefersDark: darkModeQuery.matches, 
      detectedTheme,
      currentSystemTheme: systemTheme 
    })
    setSystemTheme(detectedTheme)

    // Listen for system theme changes
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'night' : 'light'
      console.log('[Theme] System theme changed:', { prefersDark: e.matches, newTheme })
      setSystemTheme(newTheme)
    }

    darkModeQuery.addEventListener('change', handleSystemThemeChange)
    return () => darkModeQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])
  // === SYSTEM THEME DETECTION - END ===

  // Load theme from localStorage when user changes
  useEffect(() => {
    if (user?.sub) {
      const savedTheme = localStorage.getItem(`user_${user.sub}_theme`) as Theme
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'night' || savedTheme === 'system')) {
        setTheme(savedTheme)
      } else {
        setTheme('system') // Default to system preference
      }
    } else {
      // For non-logged-in users, check global preference
      const globalTheme = localStorage.getItem('chatty-theme') as Theme
      if (globalTheme && (globalTheme === 'light' || globalTheme === 'night' || globalTheme === 'system')) {
        setTheme(globalTheme)
      } else {
        setTheme('system')
      }
    }
  }, [user])

  // Calculate actual theme
  const actualTheme = theme === 'system' ? systemTheme : theme

  // === THEME APPLICATION - START ===
  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'system' ? systemTheme : theme
    
    console.log('[Theme] Applying theme:', { 
      setting: theme, 
      systemTheme, 
      resolved,
      localStorage: localStorage.getItem('chatty-theme')
    })

    // Clear previous state
    root.classList.remove('theme-light', 'theme-night', 'night-mode')
    root.removeAttribute('data-theme')

    // Apply classes/attributes so CSS variables take effect
    root.setAttribute('data-theme', resolved)
    root.classList.add(`theme-${resolved}`)
    if (resolved === 'night') {
      root.classList.add('night-mode')
    }
  }, [theme, systemTheme])
  // === THEME APPLICATION - END ===

  // Save theme to localStorage when it changes
  useEffect(() => {
    if (user?.sub) {
      localStorage.setItem(`user_${user.sub}_theme`, theme)
    } else {
      localStorage.setItem('chatty-theme', theme)
    }
  }, [theme, user])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
