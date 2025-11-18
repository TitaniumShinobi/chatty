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
    setSystemTheme(darkModeQuery.matches ? 'night' : 'light')

    // Listen for system theme changes
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'night' : 'light')
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
    
    // Remove all theme classes first
    root.classList.remove('theme-light', 'theme-night')
    
    if (theme === 'system') {
      // Let CSS @media queries handle system preference
      console.log(`Using system theme preference: ${systemTheme}`)
    } else {
      // Apply explicit theme class
      root.classList.add(`theme-${theme}`)
      console.log(`Applied theme-${theme} class to document element`)
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
