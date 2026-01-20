import React, { createContext, useContext, useEffect, useState } from 'react'
import SunCalc from 'suncalc'
import { type User } from './auth'

export type Theme = 'light' | 'night' | 'auto'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'night' // The actual resolved theme (when system is selected)
  sunTimes?: { sunrise: Date; sunset: Date } | null
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

// Default coordinates (Atlanta, GA - Devon's approximate location based on EST timezone)
const DEFAULT_COORDS = { lat: 33.749, lng: -84.388 }

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, user }) => {
  const [theme, setTheme] = useState<Theme>('auto')
  const [systemTheme, setSystemTheme] = useState<'light' | 'night'>('light')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_COORDS)
  const [sunTimes, setSunTimes] = useState<{ sunrise: Date; sunset: Date } | null>(null)

  // === GEOLOCATION - Get user's location for accurate sunrise/sunset ===
  useEffect(() => {
    // Try to get saved location first
    const savedLat = localStorage.getItem('chatty_user_lat')
    const savedLng = localStorage.getItem('chatty_user_lng')
    
    if (savedLat && savedLng) {
      setCoords({ lat: parseFloat(savedLat), lng: parseFloat(savedLng) })
      console.log('[Theme] Using saved location:', { lat: savedLat, lng: savedLng })
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setCoords({ lat: latitude, lng: longitude })
          localStorage.setItem('chatty_user_lat', latitude.toString())
          localStorage.setItem('chatty_user_lng', longitude.toString())
          console.log('[Theme] Got geolocation:', { lat: latitude, lng: longitude })
        },
        (error) => {
          console.log('[Theme] Geolocation denied/unavailable, using default:', DEFAULT_COORDS, error.message)
        },
        { timeout: 5000, maximumAge: 86400000 } // Cache for 24 hours
      )
    }
  }, [])

  // === SUNRISE/SUNSET CALCULATION - START ===
  useEffect(() => {
    const calculateSunTheme = (): 'light' | 'night' => {
      const now = new Date()
      const times = SunCalc.getTimes(now, coords.lat, coords.lng)
      
      setSunTimes({ sunrise: times.sunrise, sunset: times.sunset })
      
      const isDay = now >= times.sunrise && now < times.sunset
      
      console.log('[Theme] Sunrise/Sunset detection:', { 
        now: now.toLocaleTimeString(),
        sunrise: times.sunrise.toLocaleTimeString(),
        sunset: times.sunset.toLocaleTimeString(),
        isDay,
        coords
      })
      
      return isDay ? 'light' : 'night'
    }
    
    const detectedTheme = calculateSunTheme()
    setSystemTheme(detectedTheme)

    // Check every minute for sunrise/sunset transitions
    const intervalId = setInterval(() => {
      const newTheme = calculateSunTheme()
      setSystemTheme(prev => {
        if (prev !== newTheme) {
          console.log('[Theme] Sun-based theme changed:', { newTheme })
        }
        return newTheme
      })
    }, 60000) // Check every minute

    return () => clearInterval(intervalId)
  }, [coords])
  // === SUNRISE/SUNSET CALCULATION - END ===

  // Load theme from localStorage when user changes
  useEffect(() => {
    if (user?.sub) {
      const savedTheme = localStorage.getItem(`user_${user.sub}_theme`)
      // Migration: convert old 'system' to new 'auto'
      if (savedTheme === 'system') {
        setTheme('auto')
      } else if (savedTheme && (savedTheme === 'light' || savedTheme === 'night' || savedTheme === 'auto')) {
        setTheme(savedTheme)
      } else {
        setTheme('auto') // Default to auto (sunrise/sunset based)
      }
    } else {
      // For non-logged-in users, check global preference
      const globalTheme = localStorage.getItem('chatty-theme')
      // Migration: convert old 'system' to new 'auto'
      if (globalTheme === 'system') {
        setTheme('auto')
      } else if (globalTheme && (globalTheme === 'light' || globalTheme === 'night' || globalTheme === 'auto')) {
        setTheme(globalTheme)
      } else {
        setTheme('auto')
      }
    }
  }, [user])

  // Calculate actual theme
  const actualTheme = theme === 'auto' ? systemTheme : theme

  // === THEME APPLICATION - START ===
  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'auto' ? systemTheme : theme
    
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
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme, sunTimes }}>
      {children}
    </ThemeContext.Provider>
  )
}
