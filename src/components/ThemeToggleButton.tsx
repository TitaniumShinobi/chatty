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
  const { actualTheme, toggleQuickTheme } = useTheme()

  const getIcon = () => {
    return actualTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />
  }

  const getAriaLabel = () => {
    return `Currently ${actualTheme} mode, click to toggle`
  }

  return (
    <button
      onClick={toggleQuickTheme}
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
