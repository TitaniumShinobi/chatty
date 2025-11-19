import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'
import { cn } from '../lib/utils'

interface ThemeToggleButtonProps {
  collapsed?: boolean
  className?: string
  style?: React.CSSProperties
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  collapsed = false,
  className,
  style: customStyle
}) => {
  const { theme, setTheme, actualTheme } = useTheme()
  
  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(actualTheme === 'light' ? 'night' : 'light')
      return
    }
    setTheme(theme === 'light' ? 'night' : 'light')
  }

  const getIcon = () => {
    if (theme === 'system') {
      return actualTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />
    }
    return theme === 'light' ? <Moon size={16} /> : <Sun size={16} />
  }

  const getAriaLabel = () => {
    if (theme === 'system') {
      return `Currently using system theme (${actualTheme}), click to switch to light theme`
    }
    return `Currently using ${theme} theme, click to switch to ${theme === 'light' ? 'night' : theme === 'night' ? 'system' : 'light'} theme`
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'p-2 rounded transition-colors duration-150 flex items-center justify-center',
        className
      )}
      aria-label={getAriaLabel()}
      style={{ color: 'var(--chatty-text)', ...(customStyle || {}) }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--chatty-highlight)'
        e.currentTarget.style.color = 'var(--chatty-highlight-text)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
        e.currentTarget.style.color = 'var(--chatty-text)'
      }}
    >
      {getIcon()}
    </button>
  )
}
