import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { type User } from './auth'
import { getActiveThemeScript, getAvailableThemeScripts, isThemeScriptActive, type ThemeScript } from './calendarThemeService'

// Time-based theme: light 7:00–19:00, night 19:00–7:00 (no geolocation/OS)
export function getTimeBasedTheme(): 'light' | 'night' {
  const hour = new Date().getHours()
  return (hour >= 19 || hour < 7) ? 'night' : 'light'
}

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

// Fixed day boundaries for display (7:00 / 19:00)
function getFixedSunTimesForToday(): { sunrise: Date; sunset: Date } {
  const d = new Date()
  const sunrise = new Date(d)
  sunrise.setHours(7, 0, 0, 0)
  const sunset = new Date(d)
  sunset.setHours(19, 0, 0, 0)
  return { sunrise, sunset }
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, user }) => {
  const [theme, setThemeInternal] = useState<Theme>('auto')
  const [sessionThemeOverride, setSessionThemeOverride] = useState<'light' | 'night' | null>(null)
  const [systemTheme, setSystemTheme] = useState<'light' | 'night'>(getTimeBasedTheme)
  const [sunTimes, setSunTimes] = useState<{ sunrise: Date; sunset: Date } | null>(() => getFixedSunTimesForToday())
  const [themeScriptSetting, setThemeScriptSetting] = useState<ThemeScriptId>('auto')
  const [activeThemeScript, setActiveThemeScript] = useState<ThemeScript | null>(null)
  const [themeInitialized, setThemeInitialized] = useState(false)
  const [themeScriptCalendarTick, setThemeScriptCalendarTick] = useState(0)
  const availableThemeScripts = useMemo(() => getAvailableThemeScripts(), [])
  const lastAppliedScriptIdRef = useRef<string | null>(null)
  
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

  // === TIME-BASED THEME (7:00–19:00 light, 19:00–7:00 night) - no geolocation/OS ===
  useEffect(() => {
    const tick = () => {
      const next = getTimeBasedTheme()
      setSystemTheme(prev => {
        if (prev !== next) console.log('[Theme] Time-based theme changed:', { next })
        return next
      })
      setSunTimes(getFixedSunTimesForToday())
    }
    tick()
    const intervalId = setInterval(tick, 60000)
    return () => clearInterval(intervalId)
  }, [])

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

  // When Theme is Auto, re-check calendar every minute so seasonal theme updates at midnight without refresh
  useEffect(() => {
    if (themeScriptSetting !== 'auto') return
    const id = setInterval(() => setThemeScriptCalendarTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [themeScriptSetting])

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

    const nextId = script?.id ?? null
    const prevId = lastAppliedScriptIdRef.current

    if (nextId === prevId) return

    lastAppliedScriptIdRef.current = nextId

    setActiveThemeScript(script)

    const root = document.documentElement
    availableThemeScripts.forEach(s => {
      root.classList.remove(`theme-script-${s.id}`)
    })

    if (script) {
      root.classList.add(`theme-script-${script.id}`)
      console.log('[Theme] Applied theme script:', script.id)
    }
  }, [themeScriptSetting, availableThemeScripts, themeScriptCalendarTick])

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
  // Apply theme to document; when auto, do not override if data-theme-manual is set
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto' && root.hasAttribute('data-theme-manual')) return

    const resolved = theme === 'auto'
      ? (sessionThemeOverride ?? systemTheme)
      : theme

    console.log('[Theme] Applying theme:', {
      setting: theme,
      systemTheme,
      resolved,
      localStorage: localStorage.getItem('chatty-theme')
    })

    root.classList.remove('theme-light', 'theme-night', 'night-mode')
    root.removeAttribute('data-theme')

    root.setAttribute('data-theme', resolved)
    root.classList.add(`theme-${resolved}`)
    if (resolved === 'night') {
      root.classList.add('night-mode')
    }
    if (theme === 'light' || theme === 'night') {
      root.setAttribute('data-theme-manual', 'true')
    } else {
      root.removeAttribute('data-theme-manual')
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
