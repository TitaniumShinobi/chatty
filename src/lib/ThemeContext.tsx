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
  // Note: Browser matchMedia is unreliable in Replit's webview/iframe environment
  // Using time-based theming instead: light during daytime (6am-6pm), night during evening
  useEffect(() => {
    const getTimeBasedTheme = (): 'light' | 'night' => {
      const hour = new Date().getHours()
      // Daytime: 6am (6) to 6pm (18)
      return (hour >= 6 && hour < 18) ? 'light' : 'night'
    }
    
    const detectedTheme = getTimeBasedTheme()
    console.log('[Theme] Time-based detection:', { 
      hour: new Date().getHours(),
      detectedTheme,
      currentSystemTheme: systemTheme 
    })
    setSystemTheme(detectedTheme)

    // Check every minute for time-based theme changes
    const intervalId = setInterval(() => {
      const newTheme = getTimeBasedTheme()
      setSystemTheme(prev => {
        if (prev !== newTheme) {
          console.log('[Theme] Time-based theme changed:', { newTheme })
        }
        return newTheme
      })
    }, 60000) // Check every minute

    return () => clearInterval(intervalId)
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
