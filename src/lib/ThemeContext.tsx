import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import SunCalc from 'suncalc'
import { type User } from './auth'
import { getActiveThemeScript, getAvailableThemeScripts, isThemeScriptActive, type ThemeScript } from './calendarThemeService'

export type Theme = 'light' | 'night' | 'auto'
export type ThemeScriptId = 'none' | 'auto' | string

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  actualTheme: 'light' | 'night'
  sunTimes?: { sunrise: Date; sunset: Date } | null
  activeThemeScript: ThemeScript | null
  themeScriptSetting: ThemeScriptId
  setThemeScriptSetting: (setting: ThemeScriptId) => void
  availableThemeScripts: ThemeScript[]
  sessionThemeOverride: 'light' | 'night' | null
  setSessionThemeOverride: (override: 'light' | 'night' | null) => void
  toggleQuickTheme: () => void
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

// Calculate initial theme based on time of day (before component mounts)
function getInitialSystemTheme(): 'light' | 'night' {
  const now = new Date()
  const savedLat = typeof window !== 'undefined' ? localStorage.getItem('chatty_user_lat') : null
  const savedLng = typeof window !== 'undefined' ? localStorage.getItem('chatty_user_lng') : null
  const coords = savedLat && savedLng 
    ? { lat: parseFloat(savedLat), lng: parseFloat(savedLng) }
    : DEFAULT_COORDS
  const times = SunCalc.getTimes(now, coords.lat, coords.lng)
  const isDay = now >= times.sunrise && now < times.sunset
  return isDay ? 'light' : 'night'
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, user }) => {
  const [theme, setThemeInternal] = useState<Theme>('auto')
  const [sessionThemeOverride, setSessionThemeOverride] = useState<'light' | 'night' | null>(null)
  const [systemTheme, setSystemTheme] = useState<'light' | 'night'>(getInitialSystemTheme)
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_COORDS)
  const [sunTimes, setSunTimes] = useState<{ sunrise: Date; sunset: Date } | null>(null)
  const [themeScriptSetting, setThemeScriptSetting] = useState<ThemeScriptId>('auto')
  const [activeThemeScript, setActiveThemeScript] = useState<ThemeScript | null>(null)
  const [themeInitialized, setThemeInitialized] = useState(false)
  const availableThemeScripts = useMemo(() => getAvailableThemeScripts(), [])
  
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeInternal(newTheme)
    setSessionThemeOverride(null)
  }, [])
  
  const toggleQuickTheme = useCallback(() => {
    if (theme === 'auto') {
      const currentActual = sessionThemeOverride ?? systemTheme
      setSessionThemeOverride(currentActual === 'light' ? 'night' : 'light')
    } else {
      setThemeInternal(theme === 'light' ? 'night' : 'light')
    }
  }, [theme, sessionThemeOverride, systemTheme])

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
      const savedScriptSetting = localStorage.getItem(`user_${user.sub}_themeScript`)
      if (savedTheme === 'system') {
        setTheme('auto')
      } else if (savedTheme && (savedTheme === 'light' || savedTheme === 'night' || savedTheme === 'auto')) {
        setTheme(savedTheme)
      } else {
        setTheme('auto')
      }
      if (savedScriptSetting) {
        setThemeScriptSetting(savedScriptSetting as ThemeScriptId)
      }
    } else {
      const globalTheme = localStorage.getItem('chatty-theme')
      const globalScriptSetting = localStorage.getItem('chatty-themeScript')
      if (globalTheme === 'system') {
        setTheme('auto')
      } else if (globalTheme && (globalTheme === 'light' || globalTheme === 'night' || globalTheme === 'auto')) {
        setTheme(globalTheme)
      } else {
        setTheme('auto')
      }
      if (globalScriptSetting) {
        setThemeScriptSetting(globalScriptSetting as ThemeScriptId)
      }
    }
    setThemeInitialized(true)
  }, [user])

  // === THEME SCRIPT DETECTION ===
  useEffect(() => {
    let script: ThemeScript | null = null
    
    if (themeScriptSetting === 'none') {
      script = null
    } else if (themeScriptSetting === 'auto') {
      script = getActiveThemeScript()
    } else {
      const found = availableThemeScripts.find(s => s.id === themeScriptSetting)
      if (found && isThemeScriptActive(found)) {
        script = found
      } else if (found) {
        script = found
      }
    }
    
    setActiveThemeScript(script)
    
    const root = document.documentElement
    availableThemeScripts.forEach(s => {
      root.classList.remove(`theme-script-${s.id}`)
    })
    
    if (script) {
      root.classList.add(`theme-script-${script.id}`)
      console.log('[Theme] Applied theme script:', script.id)
    }
  }, [themeScriptSetting, availableThemeScripts])

  // Save theme script setting to localStorage (only after initial load)
  useEffect(() => {
    if (!themeInitialized) return
    if (user?.sub) {
      localStorage.setItem(`user_${user.sub}_themeScript`, themeScriptSetting)
    } else {
      localStorage.setItem('chatty-themeScript', themeScriptSetting)
    }
  }, [themeScriptSetting, user, themeInitialized])

  // Calculate actual theme - respects session override when auto is set
  const actualTheme: 'light' | 'night' = theme === 'auto' 
    ? (sessionThemeOverride ?? systemTheme)
    : theme

  // === THEME APPLICATION - START ===
  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'auto' 
      ? (sessionThemeOverride ?? systemTheme) 
      : theme
    
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
  }, [theme, systemTheme, sessionThemeOverride])
  // === THEME APPLICATION - END ===

  // Save theme to localStorage when it changes (only after initial load)
  useEffect(() => {
    if (!themeInitialized) return
    if (user?.sub) {
      localStorage.setItem(`user_${user.sub}_theme`, theme)
    } else {
      localStorage.setItem('chatty-theme', theme)
    }
  }, [theme, user, themeInitialized])

  const contextValue = useMemo(() => ({ 
    theme, 
    setTheme, 
    actualTheme, 
    sunTimes,
    activeThemeScript,
    themeScriptSetting,
    setThemeScriptSetting,
    availableThemeScripts,
    sessionThemeOverride,
    setSessionThemeOverride,
    toggleQuickTheme
  }), [theme, setTheme, actualTheme, sunTimes, activeThemeScript, themeScriptSetting, setThemeScriptSetting, availableThemeScripts, sessionThemeOverride, setSessionThemeOverride, toggleQuickTheme])

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}
