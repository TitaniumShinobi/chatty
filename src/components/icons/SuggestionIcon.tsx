/**
 * Suggestion Icon Component
 * Used for CTA suggestions on the Home page
 * This is the layered/stacked icon that appears next to suggestion prompts
 */

import React from 'react'

interface SuggestionIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export const SuggestionIcon: React.FC<SuggestionIconProps> = ({ 
  size = 16, 
  className = '',
  style = {}
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
      className={className}
      style={style}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

